using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Application.DTOs;
using Application.DTOs.ReportDTos;
using Application.Enums;
using Application.Interface;
using Azure.Core;
using InfluxDB.Client;
using InfluxDB.Client.Api.Domain;
using InfluxDB.Client.Writes;
using Infrastructure.Configuration;
using Infrastructure.DBs;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query.Internal;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Serilog;

namespace Infrastructure.Service
{
    public class InfluxTelemetryService : IInfluxTelementryService
    {
        private readonly InfluxDBClient _client;
        private readonly string _bucket;
        private readonly string _org;
        private readonly int _maxExcelRows;
        private readonly int _maxCsvRows;
        private readonly DBContext _dbContext;
        private readonly QueryApi _queryApi;
        private readonly ILogger<InfluxTelemetryService> _logger;
        private readonly RabbitMqService _queue;
        

        

        public InfluxTelemetryService(
             ILogger<InfluxTelemetryService> logger,
            IInfluxDbConnectionService client,
            IOptions<InfluxDbOptions> options,
            DBContext dbContext,
            RabbitMqService queue
           )
        {
            _client = client.GetClient();
            var config = options.Value;
            _bucket = config.InfluxBucket;
            _org = config.InfluxOrg;
            _dbContext = dbContext;
            _queryApi = _client.GetQueryApi();
            _logger = logger;
            _maxExcelRows = config.ExcelMaxRows;
            _maxCsvRows = config.CsvMaxRows;
            _queue = queue;
            
        }

        public async Task WriteTelemetryAsync(InfluxTelementryDto dto)
        {
            try
            {
                var point = PointData
                    .Measurement("signals")
                    .Tag("assetId", dto.AssetId.ToString())
                    .Tag("signalTypeId", dto.SignalTypeId.ToString())
                    .Tag("deviceId", dto.DeviceId.ToString())
                    .Tag("devicePortId", dto.deviceSlaveId.ToString())
                    .Tag("mappingId", dto.MappingId.ToString())
                    .Tag("RegisterAdress", dto.RegisterAddress.ToString())
                    .Tag("SignalName", dto.SignalType.ToString())
                    .Field("value", dto.Value)
                    .Field("unit", dto.Unit)
                    .Timestamp(dto.Timestamp, WritePrecision.Ns);

                var writeApi = _client.GetWriteApiAsync();
                await writeApi.WritePointAsync(point, _bucket, _org);

                //Log.Information("Telemetry written successfully | Asset:{AssetId} | Signal:{SignalTypeId} | Value:{Value}",
                //    dto.AssetId, dto.SignalTypeId, dto.Value);
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to write telemetry to InfluxDB | Asset:{AssetId} | Signal:{SignalTypeId}",
                    dto.AssetId, dto.SignalTypeId);
                throw;
            }
        }


        public async Task<TelemetryResponseDto> GetTelemetrySeriesAsync(TelemetryRequestDto request)
        {
            try
            {
                // Fetch the mapping for the asset + signalType
                var mapping = await _dbContext.MappingTable
                    .FirstOrDefaultAsync(m => m.AssetId == request.AssetId && m.SignalTypeId == request.SignalTypeId);

                if (mapping == null)
                    throw new Exception($"Mapping not found for AssetId:{request.AssetId} and SignalTypeId:{request.SignalTypeId}");

                // Get start and end time
                var (startTime, endTime) = GetTimeRange(request);

                // Build Flux query
                string flux = BuildFluxQuery(mapping.MappingId, startTime, endTime,"Aggregated");

                Log.Information("Executing Flux Query | MappingId:{MappingId} | Start:{Start} | End:{End}",
                    mapping.MappingId, startTime, endTime);

                // Query InfluxDB
                var tables = await _queryApi.QueryAsync(flux, _org);
                var values = new List<TelemetryPointDto>();
                int tableCounter = 0;

                foreach (var table in tables)
                {
                    tableCounter++;
                    Log.Information("Processing table #{TableNum} with {RecordCount} records", tableCounter, table.Records.Count);

                    foreach (var record in table.Records)
                    {
                        if (record.GetTime().HasValue && record.GetValue() != null)
                        {
                            values.Add(new TelemetryPointDto
                            {
                                Time = record.GetTime().Value.ToDateTimeUtc().ToLocalTime(),
                                Value = (float)Math.Round(Convert.ToSingle(record.GetValue()), 2)
                            });
                        }
                    }
                }

                Log.Information("Total telemetry points fetched: {Count}", values.Count);

                return new TelemetryResponseDto
                {
                    AssetId = mapping.AssetId,
                    DeviceId = mapping.DeviceId,
                    SignalTypeId = mapping.SignalTypeId,
                    SignalName = mapping.SignalName,
                    Unit = mapping.SignalUnit,
                    StartTime = startTime,
                    EndTime = endTime,
                    TimeRange = request.TimeRange.ToString(),
                    Values = values
                };
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to fetch telemetry | AssetId:{AssetId} | SignalTypeId:{SignalTypeId}",
                    request.AssetId, request.SignalTypeId);
                throw new Exception($"Failed to retrieve telemetry: {ex.Message}");
            }
        }

public async Task<TelemetryResponseDto> GetRawData(TelemetryRequestDto request)
{
    try
    {
               
        // if ((request.EndTime - request.StartTime).TotalMinutes > 10)
        //     throw new Exception("Raw data range cannot exceed 10 minutes");

        var (startTime, endTime) = GetTimeRange(request);

        if (endTime <= startTime)
            throw new Exception("EndTime must be greater than StartTime");


        var mapping = await _dbContext.MappingTable
            .FirstOrDefaultAsync(m =>
                m.AssetId == request.AssetId &&
                m.SignalTypeId == request.SignalTypeId);

        if (mapping == null)
            throw new Exception($"Mapping not found for AssetId:{request.AssetId} and SignalTypeId:{request.SignalTypeId}");

      
        string flux = BuildFluxQuery(mapping.MappingId, startTime, endTime,"Raw");

        Log.Information(
            "Executing RAW Flux Query | MappingId:{MappingId} | Start:{Start} | End:{End}",
            mapping.MappingId, startTime, endTime);

        var tables = await _queryApi.QueryAsync(flux, _org);
        var values = new List<TelemetryPointDto>();

        foreach (var table in tables)
        {
            foreach (var record in table.Records)
            {
                if (record.GetTime().HasValue && record.GetValue() != null)
                {
                    values.Add(new TelemetryPointDto
                    {
                        Time = record.GetTime().Value
                            .ToDateTimeUtc()
                            .ToLocalTime(),

                        Value = (float)Math.Round(
                            Convert.ToSingle(record.GetValue()), 2)
                    });
                }
            }
        }

        Log.Information("RAW telemetry points fetched: {Count}", values.Count);

        // 5️⃣ Return response
        return new TelemetryResponseDto
        {
            AssetId = mapping.AssetId,
            DeviceId = mapping.DeviceId,
            SignalTypeId = mapping.SignalTypeId,
            SignalName = mapping.SignalName,
            Unit = mapping.SignalUnit,
            StartTime = startTime,
            EndTime = endTime,
            Values = values
        };
    }
    catch (Exception ex)
    {
        Log.Error(ex,
            "Failed to fetch RAW telemetry | AssetId:{AssetId} | SignalTypeId:{SignalTypeId}",
            request.AssetId, request.SignalTypeId);

        throw;
    }
}


        public async Task<TelemetryResponseDto> GetTelemetrySeriesAsync(Guid assetId, Guid signalTypeId, string startTime)
        {
            DateTime startDateTime;
            DateTime? endDateTime = null;

            // Parse startTime
            if (!DateTime.TryParse(startTime, out startDateTime))
            {
                // Try relative time format
                if (startTime.StartsWith("-"))
                {
                    startDateTime = ParseRelativeTime(startTime);
                }
                else
                {
                    throw new Exception("Invalid startTime format. Use ISO 8601 (2025-12-03T14:30:00Z) or relative (-1h, -24h, -7d)");
                }
            }

            var request = new TelemetryRequestDto
            {
                AssetId = assetId,
                SignalTypeId = signalTypeId,
                TimeRange = TimeRange.Custom,
                StartDate = startDateTime,
                EndDate = endDateTime
            };

            return await GetTelemetrySeriesAsync(request);
        }

        //Helper to calculate the time
        private (DateTime startTime, DateTime endTime) GetTimeRange(TelemetryRequestDto request)
        {
            var now = DateTime.UtcNow;
            DateTime startTime;
            DateTime endTime = now;

            switch (request.TimeRange)
            {
                case TimeRange.LastHour:
                    startTime = now.AddHours(-1);
                    break;

                case TimeRange.Last6Hours:
                    startTime = now.AddHours(-6);
                    break;

                case TimeRange.Last24Hours:
                    startTime = now.AddHours(-24);
                    break;

                case TimeRange.Last7Days:
                    startTime = now.AddDays(-7);
                    break;

                case TimeRange.Last30Days:
                    startTime = now.AddDays(-30);
                    break;

                case TimeRange.Custom:
                    if (!request.StartDate.HasValue)
                        throw new Exception("StartDate is required for Custom time range");

                    startTime = request.StartDate.Value.ToUniversalTime();
                    endTime = request.EndDate?.ToUniversalTime() ?? now;

                    // Validate date range
                    if (startTime >= endTime)
                        throw new Exception("StartDate must be before EndDate");

                    break;

                default:
                    throw new Exception($"Unsupported time range: {request.TimeRange}");
            }

            return (startTime, endTime);
        }

        // helper Build Flux query
        private string BuildFluxQuery(Guid mappingId, DateTime startTime, DateTime endTime,string Type)
        {
            var fluxStartTime = startTime.ToString("yyyy-MM-ddTHH:mm:ssZ");
            var fluxEndTime = endTime.ToString("yyyy-MM-ddTHH:mm:ssZ");

            if(Type=="Aggregated"){
            var window = GetAggregationWindow(startTime, endTime);

            return $@"
                    from(bucket: ""{_bucket}"")
                    |> range(start: {fluxStartTime}, stop: {fluxEndTime})
                    |> filter(fn: (r) => r._field == ""value"")
                    |> filter(fn: (r) => r.mappingId == ""{mappingId}"")
                    |> aggregateWindow(every: {window}, fn: mean, createEmpty: false)
                    |> keep(columns: [""_time"", ""_value""])
                    |> sort(columns: [""_time""], desc: false)";
            }
            else
            {
                return $@"
                    from(bucket: ""{_bucket}"")
                    |> range(start: {fluxStartTime}, stop: {fluxEndTime})
                    |> filter(fn: (r) => r._field == ""value"")
                    |> filter(fn: (r) => r.mappingId == ""{mappingId}"")
                    |> keep(columns: [""_time"", ""_value""])
                    |> sort(columns: [""_time""], desc: false)";

            }

        }

        // Helper:parse the time string 
        private DateTime ParseRelativeTime(string relativeTime)
        {
            var now = DateTime.UtcNow;

            if (relativeTime == "-1h") return now.AddHours(-1);
            if (relativeTime == "-6h") return now.AddHours(-6);
            if (relativeTime == "-24h") return now.AddHours(-24);
            if (relativeTime == "-7d") return now.AddDays(-7);
            if (relativeTime == "-30d") return now.AddDays(-30);

            // Generic parser for formats like "-5h", "-10d", etc.
            var match = System.Text.RegularExpressions.Regex.Match(relativeTime, @"^-(\d+)([hd])$");
            if (match.Success)
            {
                var value = int.Parse(match.Groups[1].Value);
                var unit = match.Groups[2].Value;

                return unit switch
                {
                    "h" => now.AddHours(-value),
                    "d" => now.AddDays(-value),
                    _ => throw new Exception($"Unsupported time unit: {unit}")
                };
            }

            throw new Exception($"Invalid relative time format: {relativeTime}");
        }


        private string GetAggregationWindow(DateTime start, DateTime end)
        {
            var duration = end - start;

            Log.Information($"the duration is {duration}");



            if (duration <= TimeSpan.FromHours(6))
                return "5s";
            if (duration <= TimeSpan.FromDays(1))
                return "1m";       // Today / last 24h → raw 1s data
            else if (duration <= TimeSpan.FromDays(7))
                return "5m";       // Last 7 days → 1 min aggregation
            else if (duration <= TimeSpan.FromDays(30))
                return "10m";       // Last 1 month → 5 min aggregation
            else if (duration <= TimeSpan.FromDays(90))
                return "30m";      // Last 3 months → 15 min aggregation
            else if (duration <= TimeSpan.FromDays(180))
                return "1h";      // Last 6 months → 30 min aggregation
            else if (duration <= TimeSpan.FromDays(365))
                return "2h";       // Last 1 year → 1 hour aggregation
            else
                return "5h";       // >1 year → 1 hour
        }

        //private async Task<int> GetRowsCountFromInfluxDbAsync(List<string> mappingIds, DateTime startTime, DateTime endTime)
        //{
        //    try
        //    {
        //        if (mappingIds == null || mappingIds.Count == 0)
        //        {
        //            _logger.LogWarning("No mapping IDs provided for count query.");
        //            return 0;
        //        }

        //        _logger.LogInformation("Preparing count query for {Count} mapping IDs", mappingIds.Count);

        //        var fluxStartTime = startTime.ToString("yyyy-MM-ddTHH:mm:ssZ");
        //        var fluxEndTime = endTime.ToString("yyyy-MM-ddTHH:mm:ssZ");

        //        string fluxArray = string.Join(",", mappingIds.Select(id => $"\"{id.ToLower()}\""));

        //        string fluxQuery = $@"
        //mappingIds = [{fluxArray}]
        //from(bucket: ""{_bucket}"")
        //  |> range(start: {fluxStartTime}, stop: {fluxEndTime})
        //  |> filter(fn: (r) => r._field == ""value"")
        //  |> filter(fn: (r) => contains(value: r.mappingId, set: mappingIds))
        //  |> count()";

        //        _logger.LogInformation("Flux Query: {FluxQuery}", fluxQuery);

        //        var queryApi = _client.GetQueryApi();
        //        var tables = await queryApi.QueryAsync(fluxQuery, _org); // replace with your org

        //        int totalCount = tables.Sum(table => table.Records.Sum(r => Convert.ToInt64(r.GetValue())));
        //        _logger.LogInformation("Total rows returned from InfluxDB: {TotalCount}", totalCount);

        //        return totalCount;
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError(ex, "Error while querying InfluxDB for row count.");
        //        throw;
        //    }
        //}




        //public async Task PushToReportRequestQueueAsync(RequestReport dto)
        //{
        //    try
        //    {
        //        _logger.LogInformation("Processing report request for AssetID: {AssetID}", dto.AssetID);

        //        // 1️⃣ Validate Asset
        //        bool isAssetExist = await _dbContext.Assets.AnyAsync(a => a.AssetId == dto.AssetID);
        //        if (!isAssetExist)
        //        {
        //            _logger.LogWarning("Asset not found: {AssetID}", dto.AssetID);
        //            throw new Exception("No Asset Found");
        //        }

        //        // 2️⃣ Validate SignalIDs
        //        List<Guid> signalIds = dto.SignalIDs;
        //        var validSignalIds = await _dbContext.SignalTypes
        //            .Where(s => signalIds.Contains(s.SignalTypeID))
        //            .Select(s => s.SignalTypeID)
        //            .ToListAsync();

        //        var invalidSignals = signalIds.Except(validSignalIds).ToList();
        //        if (invalidSignals.Any())
        //        {
        //            _logger.LogWarning("Invalid SignalIDs requested: {InvalidSignals}", string.Join(",", invalidSignals));
        //            throw new Exception($"One or more SignalIDs are invalid: {string.Join(",", invalidSignals)}");
        //        }

        //        _logger.LogInformation("Fetching mapping IDs for AssetID {AssetID}", dto.AssetID);

        //        // 3️⃣ Fetch MappingIDs
        //        var mappingIds = await _dbContext.MappingTable
        //            .Where(m => m.AssetId == dto.AssetID && signalIds.Contains(m.SignalTypeId))
        //            .Select(m => m.MappingId.ToString().ToLower())
        //            .ToListAsync();

        //        if (!mappingIds.Any())
        //        {
        //            _logger.LogWarning("No mapping found for AssetID {AssetID} with requested signals", dto.AssetID);
        //            throw new Exception("No mapping found for the given Asset and SignalIDs");
        //        }

        //        _logger.LogInformation("Found {Count} mapping IDs", mappingIds.Count);

        //        // 4️⃣ Get total rows from InfluxDB
        //        long totalRows = await GetRowsCountFromInfluxDbAsync(
        //            mappingIds,
        //            dto.StartDate ?? DateTime.UtcNow.AddDays(-1),
        //            dto.EndDate ?? DateTime.UtcNow
        //        );

        //        _logger.LogInformation("Total rows for report: {TotalRows}", totalRows);

        //        // 5️⃣ Determine report format based on row count
        //        string finalReportFormat = DetermineReportFormat(dto.ReportFormat, totalRows);

        //        _logger.LogInformation("Requested format: {Requested}, Final format: {Final}, Total rows: {Rows}",
        //            dto.ReportFormat, finalReportFormat, totalRows);

        //        // 6️⃣ Create report request for queue
        //        var reportRequest = new ReportQueueItem
        //        {
        //            AssetId = dto.AssetID.ToString(),
        //            SignalIds = dto.SignalIDs,
        //            MappingIds = mappingIds,
        //            StartDate = dto.StartDate ?? DateTime.UtcNow.AddDays(-1),
        //            EndDate = dto.EndDate ?? DateTime.UtcNow,
        //            ReportFormat = finalReportFormat,
        //            TotalRows = totalRows,
        //            RequestedAt = DateTime.UtcNow
        //        };

        //        _queue.PublishAsync(reportRequest);
        //        // TODO: Push to background queue for actual report generation
        //        // await _reportQueue.EnqueueAsync(reportRequest);
        //         _logger.LogInformation("Queue Message Format: {@ReportRequest}" ,reportRequest );
        //        _logger.LogInformation("Report request queued successfully for AssetID: {AssetID} with format: {Format}",
        //            dto.AssetID, finalReportFormat);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError(ex, "Error while processing report request for AssetID: {AssetID}", dto.AssetID);
        //        throw;
        //    }
        //}

        ///// <summary>
        ///// Determines the appropriate report format based on row count and user preference
        ///// </summary>
        //private string DetermineReportFormat(string requestedFormat, long totalRows)
        //{
        //    // Handle case where no rows exist
        //    if (totalRows == 0)
        //    {
        //        _logger.LogWarning("No data found for the specified criteria");
        //        throw new Exception("No data available for the specified date range and signals");
        //    }

        //    // Check if data exceeds CSV limit
        //    if (totalRows > _maxCsvRows)
        //    {
        //        _logger.LogError("Data volume exceeds maximum limit. Rows: {TotalRows}, Max: {MaxRows}",
        //            totalRows, _maxCsvRows);
        //        throw new Exception(
        //            $"The requested report contains {totalRows:N0} rows, which exceeds the maximum limit of {_maxCsvRows:N0} rows. " +
        //            "Please reduce the date range or number of signals, or request aggregated data instead."
        //        );
        //    }

        //    // If user requested Excel but data exceeds Excel limit
        //    if (requestedFormat.Equals("Excel", StringComparison.OrdinalIgnoreCase) && totalRows > _maxExcelRows)
        //    {
        //        _logger.LogWarning(
        //            "Excel format requested but row count ({TotalRows}) exceeds Excel limit ({MaxExcel}). Switching to CSV.",
        //            totalRows, _maxExcelRows
        //        );
        //        return "CSV";
        //    }

        //    // If user requested CSV and data is within limit
        //    if (requestedFormat.Equals("CSV", StringComparison.OrdinalIgnoreCase) && totalRows <= _maxCsvRows)
        //    {
        //        return "CSV";
        //    }

        //    // If user requested Excel and data is within Excel limit
        //    if (requestedFormat.Equals("Excel", StringComparison.OrdinalIgnoreCase) && totalRows <= _maxExcelRows)
        //    {
        //        return "Excel";
        //    }

        //    // Default: use CSV for anything not specified
        //    _logger.LogInformation("Using CSV format as default for {TotalRows} rows", totalRows);
        //    return "CSV";
        //}



        private async Task<int> GetRowsCountFromInfluxDbAsync(List<string> mappingIds, DateTime startTime, DateTime endTime)
        {
            try
            {
                if (mappingIds == null || mappingIds.Count == 0)
                {
                    _logger.LogWarning("No mapping IDs provided for count query.");
                    return 0;
                }

                _logger.LogInformation("Preparing count query for {Count} mapping IDs", mappingIds.Count);

                var fluxStartTime = startTime.ToString("yyyy-MM-ddTHH:mm:ssZ");
                var fluxEndTime = endTime.ToString("yyyy-MM-ddTHH:mm:ssZ");

                string fluxArray = string.Join(",", mappingIds.Select(id => $"\"{id.ToLower()}\""));

                string fluxQuery = $@"
mappingIds = [{fluxArray}]
from(bucket: ""{_bucket}"")
  |> range(start: {fluxStartTime}, stop: {fluxEndTime})
  |> filter(fn: (r) => r._field == ""value"")
  |> filter(fn: (r) => contains(value: r.mappingId, set: mappingIds))
  |> count()";

                _logger.LogInformation("Flux Query: {FluxQuery}", fluxQuery);

                var queryApi = _client.GetQueryApi();
                var tables = await queryApi.QueryAsync(fluxQuery, _org);

                int totalCount = tables.Sum(table => table.Records.Sum(r => Convert.ToInt32(r.GetValue())));
                _logger.LogInformation("Total rows returned from InfluxDB: {TotalCount}", totalCount);

                return totalCount;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while querying InfluxDB for row count.");
                throw;
            }
        }

        public async Task PushToReportRequestQueueAsync(RequestReport dto)
        {
            try
            {
                _logger.LogInformation("Processing report request for AssetID: {AssetID}", dto.AssetID);

                // 1️⃣ Validate Asset
                bool isAssetExist = await _dbContext.Assets.AnyAsync(a => a.AssetId == dto.AssetID);
                if (!isAssetExist)
                {
                    _logger.LogWarning("Asset not found: {AssetID}", dto.AssetID);
                    throw new Exception("No Asset Found");
                }

                // 2️⃣ Validate SignalIDs
                List<Guid> signalIds = dto.SignalIDs;
                var validSignalIds = await _dbContext.SignalTypes
                    .Where(s => signalIds.Contains(s.SignalTypeID))
                    .Select(s => s.SignalTypeID)
                    .ToListAsync();

                var invalidSignals = signalIds.Except(validSignalIds).ToList();
                if (invalidSignals.Any())
                {
                    _logger.LogWarning("Invalid SignalIDs requested: {InvalidSignals}", string.Join(",", invalidSignals));
                    throw new Exception($"One or more SignalIDs are invalid: {string.Join(",", invalidSignals)}");
                }

                _logger.LogInformation("Fetching mapping IDs for AssetID {AssetID}", dto.AssetID);

                // 3️⃣ Fetch MappingIDs
                var mappingIds = await _dbContext.MappingTable
                    .Where(m => m.AssetId == dto.AssetID && signalIds.Contains(m.SignalTypeId))
                    .Select(m => m.MappingId.ToString().ToLower())
                    .ToListAsync();

                if (!mappingIds.Any())
                {
                    _logger.LogWarning("No mapping found for AssetID {AssetID} with requested signals", dto.AssetID);
                    throw new Exception("No mapping found for the given Asset and SignalIDs");
                }

                _logger.LogInformation("Found {Count} mapping IDs", mappingIds.Count);

                // 4️⃣ Get total rows from InfluxDB
                int totalRows = await GetRowsCountFromInfluxDbAsync(
                    mappingIds,
                    dto.StartDate ?? DateTime.UtcNow.AddDays(-1),
                    dto.EndDate ?? DateTime.UtcNow
                );

                _logger.LogInformation("Total rows for report: {TotalRows}", totalRows);

                // 5️⃣ Determine report format based on row count
                string finalReportFormat = DetermineReportFormat(dto.ReportFormat, totalRows);

                _logger.LogInformation("Requested format: {Requested}, Final format: {Final}, Total rows: {Rows}",
                    dto.ReportFormat, finalReportFormat, totalRows);

                // 6️⃣ Create report request for queue
                var reportRequest = new ReportQueueItem
                {
                    AssetId = dto.AssetID.ToString(),
                    SignalIds = dto.SignalIDs.Select(g => g.ToString()).ToList(),
                    MappingIds = mappingIds,
                    StartDate = dto.StartDate ?? DateTime.UtcNow.AddDays(-1),
                    EndDate = dto.EndDate ?? DateTime.UtcNow,
                    ReportFormat = finalReportFormat,
                    TotalRows = totalRows,
                    RequestedAt = DateTime.UtcNow
                };

                // 7️⃣ Publish to queue
                await _queue.PublishAsync(reportRequest);

                _logger.LogInformation("Queue Message Format: {@ReportRequest}", reportRequest);
                _logger.LogInformation("Report request queued successfully for AssetID: {AssetID} with format: {Format}",
                    dto.AssetID, finalReportFormat);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error while processing report request for AssetID: {AssetID}", dto.AssetID);
                throw;
            }
        }

        /// <summary>
        /// Determines the appropriate report format based on row count and user preference
        /// </summary>
        private string DetermineReportFormat(string requestedFormat, long totalRows)
        {
            // Handle case where no rows exist
            if (totalRows == 0)
            {
                _logger.LogWarning("No data found for the specified criteria");
                throw new Exception("No data available for the specified date range and signals");
            }

            // Check if data exceeds CSV limit
            if (totalRows > _maxCsvRows)
            {
                _logger.LogError("Data volume exceeds maximum limit. Rows: {TotalRows}, Max: {MaxRows}",
                    totalRows, _maxCsvRows);
                throw new Exception(
                    $"The requested report contains {totalRows:N0} rows, which exceeds the maximum limit of {_maxCsvRows:N0} rows. " +
                    "Please reduce the date range or number of signals, or request aggregated data instead."
                );
            }

            // If user requested Excel but data exceeds Excel limit
            if (requestedFormat.Equals("Excel", StringComparison.OrdinalIgnoreCase) && totalRows > _maxExcelRows)
            {
                _logger.LogWarning(
                    "Excel format requested but row count ({TotalRows}) exceeds Excel limit ({MaxExcel}). Switching to CSV.",
                    totalRows, _maxExcelRows
                );
                return "CSV";
            }

            // If user requested CSV and data is within limit
            if (requestedFormat.Equals("CSV", StringComparison.OrdinalIgnoreCase) && totalRows <= _maxCsvRows)
            {
                return "CSV";
            }

            // If user requested Excel and data is within Excel limit
            if (requestedFormat.Equals("Excel", StringComparison.OrdinalIgnoreCase) && totalRows <= _maxExcelRows)
            {
                return "Excel";
            }

            // Default: use CSV for anything not specified
            _logger.LogInformation("Using CSV format as default for {TotalRows} rows", totalRows);
            return "CSV";
        }
    }
}
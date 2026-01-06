using Microsoft.AspNetCore.Mvc;
using InfluxDB.Client;
using Infrastructure.DBs;
using Application.Interface;
using Application.DTOs;
using Application.Enums;
using Infrastructure.Seeding;
using Application.DTOs.ReportDTos;
using Microsoft.AspNetCore.Authorization;


namespace WebAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TelemetryTestController : ControllerBase
    {
        private readonly IInfluxDbConnectionService _connectionService;
        private readonly IInfluxTelementryService _TelementryService;
        private readonly BackfillService _backfill;

        public TelemetryTestController(IInfluxDbConnectionService connectionService, IInfluxTelementryService telementryService,BackfillService backfill)
        {
            _connectionService = connectionService;
            _TelementryService = telementryService;
            _backfill = backfill;
        }

        [HttpGet("health")]
        public IActionResult TestConnection()
        {
            try
            {
                var client = _connectionService.GetClient();

                // Direct try to ping server (minimal check)
                var health = client.HealthAsync().GetAwaiter().GetResult();

                // Just return status string, no enum check
                return Ok(new
                {
                    status = "Connected",
                    message = $"InfluxDB server version: {health.Version}"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    status = "Failed",
                    message = ex.Message
                });
            }
        }

        [HttpGet("{assetId}/{signalTypeId}")]
          [Authorize]
        public async Task<IActionResult> GetTelemetrySeries(
            Guid assetId,
            Guid signalTypeId,
            [FromQuery] string startTime)
        {
            if (string.IsNullOrEmpty(startTime))
                return BadRequest("Start time is required");

            try
            {

                var result = await _TelementryService.GetTelemetrySeriesAsync(assetId, signalTypeId, startTime);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error retrieving telemetry: {ex.Message}");
            }
        }




        [HttpPost("query")]
        public async Task<IActionResult> GetTelemetry([FromBody] TelemetryRequestDto request)
        {
            try
            {
                var result = await _TelementryService.GetTelemetrySeriesAsync(request);
                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ERROR: {ex.Message}");
                Console.WriteLine($"STACK: {ex.StackTrace}");
                return BadRequest(new { error = ex.Message });
            }
        }


        [HttpGet("last-hour")]
        public async Task<IActionResult> GetLastHour(
           [FromQuery] Guid assetId,
           [FromQuery] Guid signalTypeId)
        {
            return await GetTelemetry(new TelemetryRequestDto
            {
                AssetId = assetId,
                SignalTypeId = signalTypeId,
                TimeRange = TimeRange.LastHour
            });
        }

        [HttpGet("last-24-hours")]
        public async Task<IActionResult> GetLast24Hours(
            [FromQuery] Guid assetId,
            [FromQuery] Guid signalTypeId)
        {
            return await GetTelemetry(new TelemetryRequestDto
            {
                AssetId = assetId,
                SignalTypeId = signalTypeId,
                TimeRange = TimeRange.Last24Hours
            });
        }

        [HttpGet("last-7-days")]
        public async Task<IActionResult> GetLast7Days(
            [FromQuery] Guid assetId,
            [FromQuery] Guid signalTypeId)
        {
            return await GetTelemetry(new TelemetryRequestDto
            {
                AssetId = assetId,
                SignalTypeId = signalTypeId,
                TimeRange = TimeRange.Last7Days
            });
        }

        [HttpGet("custom-range")]
        public async Task<IActionResult> GetCustomRange(
            [FromQuery] Guid assetId,
            [FromQuery] Guid signalTypeId,
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime? endDate = null)
        {
            return await GetTelemetry(new TelemetryRequestDto
            {
                AssetId = assetId,
                SignalTypeId = signalTypeId,
                TimeRange = TimeRange.Custom,
                StartDate = startDate,
                EndDate = endDate
            });
        }

        // 🔥 BACKWARD COMPATIBLE: Old endpoint
        [HttpGet]
        [Obsolete("Use POST /api/telemetry/query instead")]
        public async Task<IActionResult> GetTelemetryLegacy(
            [FromQuery] Guid assetId,
            [FromQuery] Guid signalTypeId,
            [FromQuery] string startTime = "-1h")
        {
            try
            {
                var result = await _TelementryService.GetTelemetrySeriesAsync(assetId, signalTypeId, startTime);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }




        [HttpPost("Seed/{AssetID}/{SignalTypeID}/{PollinInterval}")]
        public async Task<IActionResult> GenerateBackfill(Guid AssetID,Guid SignalTypeID,int PollinInterval)
        {
            // Run in background so API doesn't block
            _ = Task.Run(async () => await _backfill.GenerateBackfillData(AssetID,SignalTypeID, PollinInterval));

            return Ok("Backfill started. It may take a few minutes to complete.");
        }
        
         [HttpPost("queryraw")]
        public async Task<IActionResult> GetRawTelemetry([FromBody] TelemetryRequestDto request)
        {
            try
            {
                // Directly call the Raw data method
                var result = await _TelementryService.GetRawData(request); 
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        //[HttpPost("ReportRequest")]
        //public async Task<IActionResult> GenerateReport([FromBody] RequestReport dto)
        //{
        //    try
        //    {
                
        //        if (dto.AssetID == Guid.Empty)
        //            throw new Exception("Please provide a valid AssetId");

               
        //        if (dto.SignalIDs == null || dto.SignalIDs.Count == 0)
        //            throw new Exception("Please provide at least one SignalID");

        //        if (!dto.SignalIDs.Any(id => id != Guid.Empty))
        //            throw new Exception("SignalIDs cannot contain only empty GUIDs");

               
        //        if (!dto.StartDate.HasValue)
        //            throw new Exception("StartDate is required");

        //        if (!dto.EndDate.HasValue)
        //            throw new Exception("EndDate is required");

        //        if (dto.EndDate.Value < dto.StartDate.Value)
        //            throw new Exception("EndDate cannot be earlier than StartDate");

        //        if ((dto.EndDate.Value - dto.StartDate.Value).TotalDays > 31)
        //            throw new Exception("Date range cannot exceed 31 days");


        //        await _TelementryService.PushToReportRequestQueueAsync(dto);

        //        return Ok(new { message = "Report request accepted" });
        //    }
        //    catch (Exception ex)
        //    {
        //        return BadRequest(new { error = ex.Message });
        //    }
        //}

    }
}

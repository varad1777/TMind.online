using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Application.DTOs;
using Microsoft.Identity.Client.TelemetryCore.TelemetryClient;
using Application.DTOs;
using Application.DTOs.ReportDTos;

namespace Application.Interface
{
    public interface IInfluxTelementryService
    {
        Task WriteTelemetryAsync(InfluxTelementryDto Dto);
        Task<TelemetryResponseDto> GetTelemetrySeriesAsync(Guid assetId, Guid signalTypeId, string startTime);
        Task<TelemetryResponseDto> GetTelemetrySeriesAsync(TelemetryRequestDto request);

        Task PushToReportRequestQueueAsync(RequestReport dto);

      Task<TelemetryResponseDto> GetRawData(TelemetryRequestDto request);
    }
}

using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Infrastructure.DBs;
using Infrastructure.Service; // For your report service
using System;
using System.Linq;
using System.Threading.Tasks;
using Application.DTOs.ReportDTos;
using Application.Interface;
using Microsoft.AspNetCore.Authorization;


namespace Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ReportsController : ControllerBase
    {
        private readonly DBContext _db;
        private readonly IInfluxTelementryService _TelementryService; // your service for generating Excel

        public ReportsController(DBContext db, IInfluxTelementryService   TelementryService)
        {
            _db = db;
            _TelementryService = TelementryService;
        }

   

        [HttpPost("ReportRequest")]
          [Authorize]
        public async Task<IActionResult> GenerateReport([FromBody] RequestReport dto)
        {
            try
            {

                if (dto.AssetID == Guid.Empty)
                    throw new Exception("Please provide a valid AssetId");


                if (dto.SignalIDs == null || dto.SignalIDs.Count == 0)
                    throw new Exception("Please provide at least one SignalID");

                if (!dto.SignalIDs.Any(id => id != Guid.Empty))
                    throw new Exception("SignalIDs cannot contain only empty GUIDs");


                if (!dto.StartDate.HasValue)
                    throw new Exception("StartDate is required");

                if (!dto.EndDate.HasValue)
                    throw new Exception("EndDate is required");

                if (dto.EndDate.Value < dto.StartDate.Value)
                    throw new Exception("EndDate cannot be earlier than StartDate");

                if ((dto.EndDate.Value - dto.StartDate.Value).TotalDays > 31)
                    throw new Exception("Date range cannot exceed 31 days");


                await _TelementryService.PushToReportRequestQueueAsync(dto);

                return Ok(new { message = "Report request accepted" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

       
        [HttpGet]
          [Authorize]
        public async Task<IActionResult> GetAllReports()
        {
            var reports = await _db.ReportRequests
                .OrderByDescending(r => r.RequestedAt)
                .Select(r => new
                {
                    r.ReportId,
                    r.FileName,
                    r.AssetName,
                    r.RequestedAt,
                    r.Status
                })
                .ToListAsync();

            return Ok(reports);
        }



       
        [HttpGet("download/{reportId}")]
          [Authorize]
        public async Task<IActionResult> DownloadReport(Guid reportId)
        {
            var report = await _db.ReportRequests
                .FirstOrDefaultAsync(r => r.ReportId == reportId);

            if (report == null || !System.IO.File.Exists(report.FilePath))
                return NotFound(new { Message = "Report not found" });

            return PhysicalFile(
                report.FilePath,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                report.FileName
            );
        }


    }
}

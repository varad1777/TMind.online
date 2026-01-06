using Application.DTOs;
using Application.Interface;
using Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;


namespace Api.Controllers
{

    [ApiController]
    [Route("api/alerts")]
    public class AlertController : Controller
    {

        private readonly IAlertRepository _alertRepo;
        private readonly IAlertAnalysisRepository _alertAnalysisRepo;
        private readonly HttpClient _http;

        public AlertController(
            IAlertRepository alertRepo,
            IHttpClientFactory factory,
            IAlertAnalysisRepository alertAnalysisRepo)
        {
            _alertRepo = alertRepo;
            _http = factory.CreateClient();
            _alertAnalysisRepo = alertAnalysisRepo;
        }






        [HttpPost("analyze-asset")]
          [Authorize]
        public async Task<IActionResult> AnalyzeAssetAlerts(
    [FromBody] AnalyzeAssetAlertsRequest request)
        {
            var alerts = await _alertRepo.GetUnAnalyzedByAssetAsync(
                request.AssetId,
                request.FromUtc,
                request.ToUtc);

            if (!alerts.Any())
                return BadRequest("No unanalyzed alerts found");

            var assetName = alerts.First().AssetName;
            var durationMinutes =
    (request.ToUtc - request.FromUtc).TotalMinutes + 1;

            var payload = $"asset name is {assetName} time past {Math.Round(durationMinutes)} minutes";
            Console.WriteLine("payload si ", payload);


            var response = await _http.PostAsJsonAsync(
       "http://gateway:5000/api/ai/ai/ask",
       new { prompt = payload }
   );


            if (!response.IsSuccessStatusCode)
                return StatusCode(500, "AI failed");

            var aiText = await response.Content.ReadAsStringAsync();
            var aiResponse = JsonSerializer.Deserialize<RecommendedAction>(
                aiText,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );


            if (aiResponse.success == true)
            {
                await _alertAnalysisRepo.CreateAsync(new AlertAnalysis
                {
                    AlertAnalysisId = Guid.NewGuid(),
                    AssetId = request.AssetId,
                    AssetName = assetName,
                    FromUtc = request.FromUtc,
                    ToUtc = request.ToUtc,
                    RecommendedActions = aiResponse.rca ?? "No recommendation found",
                    AnalyzedAtUtc = DateTime.UtcNow
                });

                // ✅ Mark ALL alerts as analyzed
                await _alertRepo.MarkAnalyzedAsync(alerts.Select(a => a.AlertId));

                return Ok(new
                {
                    success = true,
                    asset = assetName,
                    from = request.FromUtc,
                    to = request.ToUtc,
                    analyzedAlerts = alerts.Count,
                    recommendation = aiText
                });
            }
            else
            {
                return BadRequest("ai failed...");

            }

        }











        [HttpGet("asset/{assetId}/pending")]
          [Authorize]
        public async Task<IActionResult> GetPendingAlerts(Guid assetId)
        {
            var alerts = await _alertRepo.GetUnAnalyzedByAssetIDAsync(assetId);

            return Ok(
      alerts
          .OrderBy(a => a.AlertStartUtc)
          .Select(a => new
          {
              a.AlertId,
              a.SignalName,
              a.AlertStartUtc,
              a.AlertEndUtc,
              a.MinObservedValue,
              a.MaxObservedValue
          })
  );

        }







        [HttpGet]
          [Authorize]
        public async Task<IActionResult> GetAll([FromQuery] DateTime? fromUtc, [FromQuery] DateTime? toUtc, [FromQuery] Guid assetId)
        {
            var alerts = await _alertRepo.GetAllAsync(fromUtc, toUtc, assetId);
            return Ok(alerts);
        }


       

    }
}

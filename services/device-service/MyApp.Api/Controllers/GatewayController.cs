using MyApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace MyApp.Api.Controllers
{
    [ApiController]
    [Route("api/Gateway")]
    public class GatewayController : ControllerBase
    {
        private readonly IGatewayService _service;

        public GatewayController(IGatewayService service)
        {
            _service=service;
        }


        [HttpGet]
        public async Task<IActionResult> GetAllGateways()
        {
            try
            {
                var Gateways = await _service.GetAllGateways();
                return Ok(Gateways);
            }
            catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }


        [HttpPost("{Name}")]
        public async Task<IActionResult> OnboardGateway(string Name)
        {
            try
            {
                
                var result=await _service.AddGatewayAsync(Name);
                return Ok(result);
            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }
    }
}
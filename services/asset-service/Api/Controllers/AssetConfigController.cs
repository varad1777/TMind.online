using Application.DTOs;
using Application.Interface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AssetConfigController : Controller
    {
        private readonly IAssetConfiguration _config;

        public AssetConfigController(IAssetConfiguration config)
        {
            _config = config;
        }

        //adding the configuration means the signals on the asset 
        [Authorize(Roles = "Admin")]
        [HttpPost]
       public async Task<IActionResult> AddConfiguration([FromBody] AssetConfigurationDto dto)
        {
            try
            {

                if (dto == null)
                    throw new Exception("Invalid Reauest");
       
                if (dto.AssetId == null || dto.AssetId==Guid.Empty)
                    throw new Exception("Provide Asset ID");

                if (dto.Signals.Count == 0 || dto.Signals==null || !dto.Signals.Any())
                    throw new Exception("Provide AtLEast One Signal in Configuration");

                if (dto.Signals.Distinct().Count() != dto.Signals.Count)
                    throw new Exception("Duplicate signals found in request");

                await _config.AddConfiguration(dto);

                return Ok("asset Configuration Added");

            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }


        [HttpGet("{ID}")]
        public async Task<IActionResult> GetSignalDetailByAssetId(Guid ID)
        {
            try
            {
                var Details = await _config.GetSignalDetailByAssetID(ID);
                return Ok(Details);
            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpPut("{Id}")]
        public async Task<IActionResult> EditSignalsOnAsset(Guid Id,[FromBody] UpdateAssetConfigurationDto Dto)
        {
            try
            {
                await _config.EditSignalsOnAsset(Id, Dto);
                return Ok("Configuration Updated Sucessfully");
            }catch(Exception Ex)
            {
                throw new Exception(Ex.Message);
            }

        }


        [Authorize(Roles = "Admin")]
        [HttpDelete("{ID}")]
        public async Task<IActionResult> DeleteSignalOnAsset(Guid ID)
        {
            try
            {
                await _config.DeleteSigalOnAsset(ID);
                return Ok("Signal Deleted Sucessfully");
            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpGet("SiganlTypes")]
         public async Task<IActionResult> GetSignalTypes()
        {
            try
            {
                var Signals = await _config.GetSiganlsToCoonfigure();

                return Ok(Signals);
            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }
        
    }
}

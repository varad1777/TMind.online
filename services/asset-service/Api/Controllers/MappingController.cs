using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using MappingService.DTOs;
using MappingService.Domain.Entities;
using Application.Interface;
using Application.DTOs;

namespace MappingService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class MappingController : ControllerBase
    {
        private readonly IMappingService _mappingService;

        public MappingController(IMappingService mappingService)
        {
            _mappingService = mappingService;
        }

        // POST api/mapping
        [HttpPost]
          [Authorize]
        public async Task<IActionResult> CreateMapping([FromBody] CreateMappingDto dto)
        {
            if (dto.AssetId == Guid.Empty || dto.DeviceId == Guid.Empty || dto.DevicePortId == Guid.Empty)
            {
                return BadRequest("AssetId, DeviceId, and DevicePortId are required.");
            }

            try
            {
                var mappings = await _mappingService.CreateMapping(dto);

                return Ok(new
                {
                    Message = "Mapping created successfully",
                    Data = mappings
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = ex.Message });
            }
        }

        // GET api/mapping
        [HttpGet]
          [Authorize]
        public async Task<IActionResult> GetMappings()
        {
            try
            {
                var mappings = await _mappingService.GetMappings();
                return Ok(mappings);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = ex.Message });
            }
        }

        [HttpDelete("{AssetId}")]
          [Authorize]
        public async Task<IActionResult> UnAssignDevicesFromAsset(Guid AssetId)
        {
            try
            {
                await _mappingService.UnassignDevice(AssetId);
                return Ok("Device Disconnected Successfully");
            }catch(Exception ex)
            {
                return BadRequest(ex.Message);
            }
        }

        [HttpGet("{assetId}")]
          [Authorize]
        public async Task<IActionResult> GetConfigOnAsset(Guid assetId)
        {
            try
            {
                var mappingonasset = await _mappingService.GetSignalsOnAnAsset(assetId);
                return Ok(mappingonasset);
            }catch(Exception ex)
            {
                throw new Exception(ex.Message);
            }
        }
        [HttpDelete("/api/deletemap/{mappingId}")]
          [Authorize]
        public async Task<IActionResult> DeleteMappingAsync(Guid mappingId)
        {
            try
            {
                bool                                        deleted = await _mappingService.DeleteMappingAsync(mappingId);

                if (!deleted)
                    return NotFound(new { message = "Mapping not found." });

                return Ok(new { message = "Mapping deleted successfully." });
            }
            catch (Exception ex)
            {

                return StatusCode(500, new { message = "Internal server error while deleting mapping." });
            }
        }
    }
}

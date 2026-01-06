using System.Threading.Tasks;
using Application.DTOs;
using Application.Interface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AssetHierarchyController : ControllerBase
    {
        private readonly IAssetHierarchyService service;
        public AssetHierarchyController(IAssetHierarchyService service)
        {
            this.service = service;
        }

        [HttpGet("[action]")]
        [Authorize]
        public async Task<IActionResult> GetAssetHierarchy()
        {

            var tree = await service.GetAssetHierarchy();
            Console.WriteLine($"Data is {HttpContext.User}");
            return Ok(tree);
        }

        [AllowAnonymous]
        [HttpGet("[action]/{parentId?}")]
        public async Task<List<AssetDto>> GetByParentIdAsync(Guid? parentId)
        {
            var assets = await service.GetByParentIdAsync(parentId);
            Console.WriteLine("Recieved ........");
            foreach (var asset in assets)
            {
                Console.WriteLine($"Asset ID: {asset.Id}, Name: {asset.Name}, IsDeleted: {asset.IsDeleted}");
            }
            return assets;
        }

        [Authorize(Roles = "Admin,Engineer")]
        [HttpPost("[action]")]
        public async Task<IActionResult> InsertAsset([FromBody] InsertionAssetDto asset)
        {
            try
            {
                bool isAdded = await service.InsertAssetAsync(asset);

                if (isAdded)
                    return Ok("Asset added successfully.");


                return BadRequest("Unable to add asset.");
            }
            catch (Exception ex)
            {
                //to catch the error thrown from service layer 
                return BadRequest(ex.Message);
            }
        }

        [Authorize(Roles = "Admin,Engineer")]
        [HttpPut("[action]")]
        public async Task<IActionResult> UpdateAsset([FromBody] UpdateAssetDto dto)
        {
            var (isAdded, message) =await service.UpdateAssetName(dto);

            if (isAdded)
                return Ok(message);

            return BadRequest(message);
        }

        [Authorize(Roles = "Admin")]
        [HttpDelete("[action]/{id}")]
        public async Task<IActionResult> DeleteAsset(Guid id)
        {
            try
            {

                bool isRemoved = await service.DeleteAsset(id);
                if (isRemoved)
                {
                    return Ok("Asset Deleted Successfully");
                }
                else
                {
                    return BadRequest("unable to delete asste ");
                }
            }
            catch (Exception ex)
            {
                return BadRequest(ex.Message);
            }


        }


        [HttpGet("Search")]
        public async Task<IActionResult> SearchAssets([FromQuery] string? term)
        {
            var results = await service.SearchAssetsAsync(term);
            return Ok(results);
        }

        [Authorize(Roles = "Admin")]
        [HttpGet("Deleted")]
        public async Task<IActionResult> GetDeletedAssets()
        {
            try
            {
                var deletedAssets = await service.GetDeletedAssetsAsync();
                return Ok(deletedAssets);
            }
            catch (Exception ex)
            {
                // Log error if you have logger injected
                return StatusCode(500, $"Error retrieving deleted assets: {ex.Message}");
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpPost("Restore/{id}")]
        public async Task<IActionResult> RestoreAsset(Guid id)
        {
            try
            {
                await service.RestoreAssetAsync(id);
                return Ok("Asset restored successfully.");
            }
            catch (KeyNotFoundException)
            {
                return NotFound("Asset not found.");
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Error restoring asset: {ex.Message}");
            }
        }


        [Authorize(Roles = "Admin")]
        [HttpPost("bulk-upload")]
        public async Task<IActionResult> BulkUpload([FromBody] AssetUploadRequest assets)
        {
            try
            {
                if (assets == null || !assets.Assets.Any())
                {
                    return BadRequest("No asset records found in request.");
                }

                var response = await service.BulkInsertAssetsAsync(assets);
                return Ok(response); // 200
            }
            catch (ArgumentException ex)
            {
                // If service throws a handled business rule exception
                return BadRequest(new { message = ex.Message });
            }
            catch (Exception ex)
            {
                // For unexpected exceptions
                return StatusCode(500, new
                {
                    message = "An error occurred while uploading assets.",
                    error = ex.Message
                });
            }
        }


    }
}

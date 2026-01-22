using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MyApp.Infrastructure.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace MyApp.Api.Controllers
{
    [ApiController]
    [Route("api/connect")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IConfiguration _config;

        public AuthController(AppDbContext db, IConfiguration config)
        {
            _db = db;
            _config = config;
        }

        [HttpPost("token")]
        public async Task<IActionResult> Token([FromForm] string client_id, [FromForm] string client_secret)
        {
            var gateway = await _db.Gateway
                .FirstOrDefaultAsync(g => g.ClientId == client_id && g.Status == "ACTIVE");

            if (gateway == null)
                return Unauthorized("Invalid client");

            var hash = HashSecret(client_secret);

            if (hash != gateway.ClientSecretHash)
                return Unauthorized("Invalid secret");

            var claims = new[]
            {
                new Claim("client_id", gateway.ClientId),
                new Claim("type", "gateway")
            };

            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_config["Jwt:Key"]!)
            );

            var token = new JwtSecurityToken(
                issuer: _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims: claims,
                expires: DateTime.UtcNow.AddMinutes(30),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
            );

            return Ok(new
            {
                access_token = new JwtSecurityTokenHandler().WriteToken(token),
                token_type = "Bearer",
                expires_in = 1800
            });
        }

        private static string HashSecret(string secret)
        {
            using var sha = SHA256.Create();
            return Convert.ToHexString(
                sha.ComputeHash(Encoding.UTF8.GetBytes(secret))
            );
        }
    }
}

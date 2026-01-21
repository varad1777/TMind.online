using System.Text.RegularExpressions;
using MyApp.Application.Interfaces;
using MyApp.Domain.Entities;
using System.Security.Cryptography;
using MyApp.Infrastructure.Data;
using MyApp.Application.DTOs;
using System.Text;
using System.Security.Cryptography.X509Certificates;
using Microsoft.EntityFrameworkCore;

namespace MyApp.Infrastructure.Services
{
    public class GatewayService : IGatewayService
    {
        private readonly AppDbContext _dbContext;

        public GatewayService(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<GatewayCredentialsResponse> AddGatewayAsync(string gatewayName)
        {
            try
            {

                if (string.IsNullOrWhiteSpace(gatewayName))
                    throw new ArgumentException("Gateway name is required", nameof(gatewayName));

                bool isExist = await _dbContext.Gateway
                                .AnyAsync(g => g.Name == gatewayName);

                if (isExist)
                {
                    throw new ArgumentException(
                        "Gateway with the same name already exists",
                        nameof(gatewayName)
                    );
                }


                gatewayName = gatewayName.Trim();

                if (gatewayName.Length < 3)
                    throw new ArgumentException("Gateway name must be at least 3 characters long", nameof(gatewayName));

                if (gatewayName.Length > 50)
                    throw new ArgumentException("Gateway name cannot exceed 50 characters", nameof(gatewayName));

                if (!Regex.IsMatch(gatewayName, @"^[a-zA-Z0-9_-]+$"))
                    throw new ArgumentException(
                        "Gateway name can contain only letters, numbers, hyphen and underscore",
                        nameof(gatewayName));


                var clientId = $"GW-{Guid.NewGuid():N}";

                var clientSecret = GenerateSecretKey(32);

                var clientSecretHash = HashSecret(clientSecret);

                var newGateway = new Gateway
                {
                    Name = gatewayName,
                    ClientId = clientId,
                    ClientSecretHash = clientSecretHash,
                    Status = "ACTIVE"
                };


                _dbContext.Gateway.Add(newGateway);
                await _dbContext.SaveChangesAsync();


                return new GatewayCredentialsResponse
                {
                    Message = "Gateway Added Sucessfully",
                    ClientId = clientId,
                    ClientSecret = clientSecret
                };
            }
            catch (Exception ex)
            {
                throw new Exception("Something went Wrong" + ex.Message);
            }
        }


        public async Task<List<GetGetwayDto>> GetAllGateways()
        {
            try
            {
                var Gateways = await _dbContext.Gateway.ToListAsync();

                if (Gateways.Count == 0)
                    return [];

                var Result = Gateways.Select(x => new GetGetwayDto
                {
                    Name = x.Name,
                    ClientId = x.ClientId
                }).ToList();

                return Result;
            }catch(Exception ex)
            {
                throw new Exception("something went wrong" + ex.Message);
            }
        }


        private static string GenerateSecretKey(int size = 32)
        {
            var bytes = new byte[size];
            RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes);
        }


        private static string HashSecret(string secret)
        {
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(secret));
            return Convert.ToHexString(hashBytes);
        }
    }
}
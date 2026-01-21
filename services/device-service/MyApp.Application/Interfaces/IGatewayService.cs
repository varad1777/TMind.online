using MyApp.Application.DTOs;

namespace MyApp.Application.Interfaces
{
    public interface IGatewayService
    {
        Task<GatewayCredentialsResponse> AddGatewayAsync(string GatewayName);

        Task<List<GetGetwayDto>> GetAllGateways();
    }
}
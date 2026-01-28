namespace MyApp.Application.DTOs
{
    public class GatewayCredentialsResponse
    {
        public string Message { get; set; } 
        public string ClientId { get; set; }
        public string ClientSecret { get; set; }
    }

    public class GetGetwayDto
    {
        public string Name { get; set; }
        public string ClientId { get; set; }
    }
}
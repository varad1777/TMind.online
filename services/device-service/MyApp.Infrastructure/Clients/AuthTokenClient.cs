using System.Net.Http;
using System.Text.Json;

namespace EdgeGateway.Infrastructure.Clients
{
    public class AuthTokenClient
    {
        private readonly HttpClient _http;

        public AuthTokenClient(HttpClient http)
        {
            _http = http;
        }

        public async Task<string> GetToken(string clientId, string clientSecret)
        {
            var form = new Dictionary<string, string>
            {
                { "client_id", clientId },
                { "client_secret", clientSecret }
            };

            var response = await _http.PostAsync(
                "/connect/token",
                new FormUrlEncodedContent(form)
            );

            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);

            return doc.RootElement.GetProperty("access_token").GetString()!;
        }
    }
}

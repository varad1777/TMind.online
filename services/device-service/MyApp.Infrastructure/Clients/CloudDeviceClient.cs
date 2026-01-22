using System.Net.Http.Headers;

namespace EdgeGateway.Infrastructure.Clients
{
    public class CloudDeviceClient
    {
        private readonly HttpClient _http;
        private readonly AuthTokenClient _auth;

        public CloudDeviceClient(HttpClient http, AuthTokenClient auth)
        {
            _http = http;
            _auth = auth;
        }

        public async Task<string> GetDevicesAsync(string clientId, string clientSecret)
        {
            var token = await _auth.GetToken(clientId, clientSecret);

            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var response = await _http.GetAsync("/api/devices");
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsStringAsync();
        }
    }
}

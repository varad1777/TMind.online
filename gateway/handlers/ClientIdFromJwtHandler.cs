using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System;

namespace Gateway.Handlers
{
   public class ClientIdFromJwtHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var token = request.Headers.Authorization?.Parameter;
        if (!string.IsNullOrEmpty(token))
        {
            var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);
            var userId = jwt.Claims.FirstOrDefault(c => c.Type == "UserId")?.Value;

            if (!string.IsNullOrEmpty(userId))
            {
                if (request.Headers.Contains("Client-Id"))
                    request.Headers.Remove("Client-Id");

                request.Headers.Add("Client-Id", userId);
            }
        }

        return await base.SendAsync(request, cancellationToken);
    }
}

}

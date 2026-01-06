using Serilog;
using System.Diagnostics;
using System.Security.Claims;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;

    public RequestLoggingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

   public async Task Invoke(HttpContext context)
{
    var sw = Stopwatch.StartNew();

    var requestId = context.TraceIdentifier;
    var method = context.Request.Method;
    var path = context.Request.Path + context.Request.QueryString;
    var ip = context.Connection.RemoteIpAddress?.ToString();
    var callerService = context.Request.Headers["X-Caller-Service"].FirstOrDefault() ?? "unknown";

    await _next(context); // let auth run first

    sw.Stop();

    // Capture user AFTER the request, when authentication has run
    var user = context.User?.Identity?.Name ?? "anonymous";

    var status = context.Response.StatusCode;

    Log.ForContext("LogType", "ApiRequest")
       .ForContext("RequestId", requestId)
       .ForContext("UserName", user)
       .ForContext("CallerService", callerService)
       .ForContext("IP", ip)
       .ForContext("Method", method)
       .ForContext("Path", path)
       .ForContext("StatusCode", status)
       .ForContext("ElapsedMs", sw.ElapsedMilliseconds)
       .Information(
           "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs} ms",
           method,
           path,
           status,
           sw.ElapsedMilliseconds
       );


}

}

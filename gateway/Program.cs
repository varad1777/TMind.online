using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using Serilog;
using Serilog.Events;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Security.Claims;
using Serilog.Sinks.MSSqlServer;
using System.Collections.ObjectModel;
using System.Data;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var authDbConnection = builder.Configuration.GetConnectionString("AuthDbConnection");

var columnOptions = new ColumnOptions();

columnOptions.Store.Remove(StandardColumn.Properties);
columnOptions.Store.Remove(StandardColumn.MessageTemplate);
columnOptions.Store.Remove(StandardColumn.Level);
columnOptions.Store.Remove(StandardColumn.Exception);
columnOptions.Store.Remove(StandardColumn.LogEvent);

// Add our custom columns
columnOptions.AdditionalColumns = new Collection<SqlColumn>
{
    new SqlColumn("UserName", SqlDbType.NVarChar, dataLength: 100),
    new SqlColumn("Method", SqlDbType.NVarChar, dataLength: 10),
    new SqlColumn("Path", SqlDbType.NVarChar, dataLength: 200),
    new SqlColumn("StatusCode", SqlDbType.Int),
    // new SqlColumn("ElapsedMs", SqlDbType.Int),
    // new SqlColumn("CallerService", SqlDbType.NVarChar, dataLength: 50)
};
// ===================== SERILOG (IMPORTANT) =====================
// IMPORTANT: Added Console sink so logs are visible in Docker logs
// IMPORTANT: File path remains same, nothing removed
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()

    // Suppress framework noise early
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore.Database.Command", LogEventLevel.Warning)

    .Enrich.FromLogContext()
    .Enrich.WithEnvironmentName()
    .Enrich.WithThreadId()

    // Console → general useful logs (optional, all logs)
    .WriteTo.Console()

    // SQL Server → ONLY API request logs
    .WriteTo.Logger(lc => lc
        .Filter.ByIncludingOnly(le =>
            le.Properties.ContainsKey("LogType") &&
            le.Properties["LogType"].ToString().Contains("ApiRequest"))
        .WriteTo.MSSqlServer(
            connectionString: authDbConnection, // string, not IConfigurationSection
            tableName: "ApiLogs",
            autoCreateSqlTable: true,
            columnOptions: columnOptions
        )
    )

    // Seq → ONLY API request logs
    .WriteTo.Logger(lc => lc
        .Filter.ByIncludingOnly(le =>
            le.Properties.ContainsKey("LogType") &&
            le.Properties["LogType"].ToString().Contains("ApiRequest"))
        .WriteTo.Seq("http://seq")
    )

    .CreateLogger();





// 🔴 THIS LINE IS REQUIRED


// ===================== CONFIGURATION =====================
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);



// ===================== READ CONFIG VALUES =====================
var jwtConfig = builder.Configuration.GetSection("Jwt");
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
var gatewayUrl = builder.Configuration["Gateway:Url"];

// ===================== VALIDATION (IMPORTANT) =====================
var jwtKey = jwtConfig["Key"];
var jwtIssuer = jwtConfig["Issuer"];
var jwtAudience = jwtConfig["Audience"];

if (string.IsNullOrWhiteSpace(jwtKey))
    throw new InvalidOperationException("JWT Key is missing");

if (string.IsNullOrWhiteSpace(jwtIssuer))
    throw new InvalidOperationException("JWT Issuer is missing");

if (string.IsNullOrWhiteSpace(jwtAudience))
    throw new InvalidOperationException("JWT Audience is missing");

if (corsOrigins == null || corsOrigins.Length == 0)
    throw new InvalidOperationException("CORS AllowedOrigins is missing");


// ===================== SERVICES =====================

// Ocelot
// IMPORTANT: DelegatingHandler injects X-Caller-Service: gateway
// IMPORTANT: register delegating handler
builder.Services.AddTransient<AddCallerServiceHeaderHandler>();

// Ocelot
builder.Services.AddOcelot(builder.Configuration)
    .AddDelegatingHandler<AddCallerServiceHeaderHandler>(true);

// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowConfiguredOrigins", policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Authentication
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata =
            jwtConfig.GetValue<bool>("RequireHttpsMetadata");

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,

            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)
            ),
         NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
             
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.ContainsKey("access_token"))
                {
                    context.Token = context.Request.Cookies["access_token"];
                }
                return Task.CompletedTask;
            }
        };
    });

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Gateway API", Version = "v1" });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter JWT token"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Bind gateway URL SAFELY
if (!string.IsNullOrWhiteSpace(gatewayUrl))
{
    builder.WebHost.UseUrls(gatewayUrl);
}

builder.Services.AddHealthChecks();
builder.Logging.ClearProviders();
builder.Logging.AddFilter("Microsoft", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.None);

// 🔴 Attach Serilog as the ONLY logger
builder.Host.UseSerilog(Log.Logger);
builder.Services.AddControllers();


builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
    {
        // Track per user if authenticated, otherwise by IP
        var userKey = httpContext.User.Identity?.Name ?? 
                      httpContext.Connection.RemoteIpAddress?.ToString() ?? "anon";

        return RateLimitPartition.GetFixedWindowLimiter(userKey, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 1000, // max requests per window
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0
        });
    });

    options.RejectionStatusCode = 429;

    // Optional: log rejected requests
    options.OnRejected = async (context, ct) =>
{
    // Recompute user/IP key, same as in the limiter
    var userKey = context.HttpContext.User.Identity?.Name ??
                  context.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "anon";

    Log.Warning("User/IP {UserKey} exceeded rate limit on {Path}",
                userKey, context.HttpContext.Request.Path);
    await Task.CompletedTask;
};

});



var app = builder.Build();

// ===================== PIPELINE =====================

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();
app.UseCors("AllowConfiguredOrigins");
app.UseWebSockets();
app.UseAuthentication();
app.UseAuthorization();

// IMPORTANT:
// This logs ONLY gateway-level endpoints (health, swagger).
// Downstream APIs are logged in backend services.
app.UseMiddleware<RequestLoggingMiddleware>();

app.MapHealthChecks("/health");

app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/api"), subApp =>
{
    subApp.UseRateLimiter();
});

// Ocelot MUST be last
await app.UseOcelot();

app.Run();


public class AddCallerServiceHeaderHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        if (!request.Headers.Contains("X-Caller-Service"))
        {
            request.Headers.Add("X-Caller-Service", "gateway");
        }

        return await base.SendAsync(request, cancellationToken);
    }
}

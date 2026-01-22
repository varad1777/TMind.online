using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MyApp.Api.Middleware;
using MyApp.Application.Interfaces;
using MyApp.Infrastructure.Data;
using MyApp.Infrastructure.Services;
using MyApp.Infrastructure.SignalRHub;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Polly;
using Serilog;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ===================== JWT Config =====================
var jwtConfig = builder.Configuration.GetSection("Jwt");

// ===================== HttpClient for Auth =====================
builder.Services.AddHttpClient("AuthClient", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Auth:BaseUrl"] ?? "http://auth-service");
})
.AddTransientHttpErrorPolicy(p => p.WaitAndRetryAsync(new[]
{
    TimeSpan.FromMilliseconds(200),
    TimeSpan.FromMilliseconds(500),
    TimeSpan.FromSeconds(1)
}))
.AddTransientHttpErrorPolicy(p => p.CircuitBreakerAsync(5, TimeSpan.FromSeconds(30)));

// ===================== Authorization =====================
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));
    options.AddPolicy("UserOnly", policy => policy.RequireRole("User"));
    options.AddPolicy("GatewayOnly", policy => policy.RequireClaim("type", "gateway"));
});

// ===================== Services =====================
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AssetDbContextForDevice>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("AssetDbConnection")));

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("DeviceDbConnection")));

builder.Services.AddScoped<IDeviceManager, DeviceManager>();
builder.Services.AddScoped<IGatewayService, GatewayService>();
builder.Services.AddHostedService<ModbusPollerHostedService>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<RabbitMqService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// ===================== OpenTelemetry =====================
builder.Services.AddOpenTelemetry()
    .WithTracing(tracer =>
    {
        tracer.AddAspNetCoreInstrumentation()
              .AddHttpClientInstrumentation()
              .AddSource("device-service")
              .SetResourceBuilder(ResourceBuilder.CreateDefault().AddService("device-service"))
              .AddJaegerExporter();
    });

// ===================== Authentication =====================
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = jwtConfig.GetValue<bool>("RequireHttpsMetadata");
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtConfig["Issuer"],
            ValidAudience = jwtConfig["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtConfig["Key"]!)
            )
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                // Support token in cookies (optional)
                if (context.Request.Cookies.ContainsKey("access_token"))
                {
                    context.Token = context.Request.Cookies["access_token"];
                }
                return Task.CompletedTask;
            }
        };
    });

// ===================== Health =====================
builder.Services.AddHealthChecks();

var app = builder.Build();

// ===================== Apply Migrations =====================
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// ===================== Middleware =====================
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Device API v1"));
}

app.UseCors("AllowFrontend");
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<ApiLoggingMiddleware>();

app.MapHealthChecks("/health");
app.MapHub<ModbusHub>("/api/hubs/modbus");
app.MapControllers();

app.Run();

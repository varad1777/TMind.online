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
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// ==============================
// Configuration
// ==============================
var jwtConfig = builder.Configuration.GetSection("Jwt");

// ==============================
// Controllers + Swagger
// ==============================
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ==============================
// Database Contexts
// ==============================
builder.Services.AddDbContext<AssetDbContextForDevice>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("AssetDbConnection")));

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DeviceDbConnection")));

// ==============================
// Application Services
// ==============================
builder.Services.AddScoped<IDeviceManager, DeviceManager>();
builder.Services.AddScoped<IGatewayService, GatewayService>();
builder.Services.AddHostedService<ModbusPollerHostedService>();

builder.Services.AddSingleton<RabbitMqService>();

// ==============================
// SignalR
// ==============================
builder.Services.AddSignalR();

// ==============================
// CORS
// ==============================
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

// ==============================
// OpenTelemetry
// ==============================
builder.Services.AddOpenTelemetry()
    .WithTracing(tracer =>
    {
        tracer
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("device-service")
            .SetResourceBuilder(
                ResourceBuilder.CreateDefault()
                    .AddService("device-service"))
            .AddJaegerExporter();
    });

// ==============================
// Authentication (JWT – M2M SAFE)
// ==============================
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
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

            ValidIssuer = jwtConfig["Issuer"],
            ValidAudience = jwtConfig["Audience"],

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtConfig["Key"]!)
            )
        };
    });

// ==============================
// Authorization (MERGED POLICIES)
// ==============================
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));

    options.AddPolicy("UserOnly", policy =>
        policy.RequireRole("User"));

    options.AddPolicy("GatewayOnly", policy =>
        policy.RequireClaim("type", "gateway"));
});

// ==============================
// Health Checks
// ==============================
builder.Services.AddHealthChecks();

// ==============================
// Build App
// ==============================
var app = builder.Build();

// ==============================
// Apply Migrations
// ==============================
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// ==============================
// Middleware Pipeline
// ==============================
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();

    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Device Service API v1");
    });
}

app.MapHealthChecks("/health");

app.UseCors("AllowFrontend");

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<ApiLoggingMiddleware>();

// ==============================
// Endpoints
// ==============================
app.MapControllers();
app.MapHub<ModbusHub>("/api/hubs/modbus");

app.Run();

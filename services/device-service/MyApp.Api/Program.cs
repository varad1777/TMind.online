using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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

// Log.Logger = new LoggerConfiguration()
//     .Enrich.FromLogContext()
//     .Enrich.WithProperty("Service", "device-service")
//     .WriteTo.Console()
//     .WriteTo.Seq(builder.Configuration["Seq:Url"] ?? "http://seq:5341")
//     .CreateLogger();
// builder.Host.UseSerilog();

var jwtConfig = builder.Configuration.GetSection("Jwt");





// HttpClient with Polly to call other services (e.g., Auth)
builder.Services.AddHttpClient("AuthClient", client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Auth:BaseUrl"] ?? "http://auth-service");
})
.AddTransientHttpErrorPolicy(p => p.WaitAndRetryAsync(new[] {
    TimeSpan.FromMilliseconds(200), TimeSpan.FromMilliseconds(500), TimeSpan.FromSeconds(1)
}))
.AddTransientHttpErrorPolicy(p => p.CircuitBreakerAsync(5, TimeSpan.FromSeconds(30)));


builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole("Admin"));
    options.AddPolicy("UserOnly", policy =>
        policy.RequireRole("User"));
});


// Add services
builder.Services.AddControllers();                       // <-- important
builder.Services.AddEndpointsApiExplorer();              // discovers endpoints for swagger
builder.Services.AddSwaggerGen();                        // <-- registers ISwaggerProvider

// This is for Asset DB access (only MappingTable or other needed tables)
builder.Services.AddDbContext<AssetDbContextForDevice>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("AssetDbConnection")));


builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("DeviceDbConnection")));





builder.Services.AddScoped<IDeviceManager, DeviceManager>();
builder.Services.AddHostedService<ModbusPollerHostedService>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<RabbitMqService>();

// Allow your frontend to call the API
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000") // frontend URL
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});


builder.Services.AddOpenTelemetry()
    .WithTracing(builder =>
    {
        builder
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("device-service")
            .SetResourceBuilder(
                ResourceBuilder.CreateDefault().AddService("device-service"))
            .AddJaegerExporter();
    });




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

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                if (context.Request.Cookies.ContainsKey("access_token"))
                {
                    context.Token = context.Request.Cookies["access_token"];
                    Console.WriteLine("Token received: " + context.Token);
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddHealthChecks();


var app = builder.Build();


using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

// Middleware
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
    app.UseSwagger();            // uses ISwaggerProvider registered by AddSwaggerGen
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
        // c.RoutePrefix = "";   // uncomment to serve swagger at root
    });
}

app.MapHealthChecks("/health");

app.UseCors("AllowFrontend");
app.MapHub<ModbusHub>("/api/hubs/modbus");

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<ApiLoggingMiddleware>();

app.MapControllers(); // <-- map controller routes

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}



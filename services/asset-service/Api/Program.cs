using Api.Extesnion;
using Application.Interface;
using Infrastructure.Configuration;
using Infrastructure.DBs;
using Infrastructure.Hubs;
using Infrastructure.Seeding;
using Infrastructure.Service;
using Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Serilog;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.Routing;
using System.Security.Claims;
using Infrastructure.Email;

var builder = WebApplication.CreateBuilder(args);

// -------------------------------------------------------
//  SERILOG
// -------------------------------------------------------
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .CreateLogger();

builder.Host.UseSerilog();

// -------------------------------------------------------
//  CONFIG
// -------------------------------------------------------
builder.Services.Configure<TelemetryOptions>(builder.Configuration.GetSection("Telemetry"));
var configuration = builder.Configuration;

builder.Services.Configure<SmtpSettings>(
    builder.Configuration.GetSection("SmtpSettings")
);

// -------------------------------------------------------
//  MAIN DB (FACTORY)
// -------------------------------------------------------
var connectionString = configuration.GetConnectionString("AssetDbConnection")
                       ?? throw new InvalidOperationException("Missing DefaultConnection.");

builder.Services.AddDbContextFactory<DBContext>(options =>
    options.UseSqlServer(connectionString));

// -------------------------------------------------------
//  USER AUTH DB
// -------------------------------------------------------
var userAuthConnectionString = configuration.GetConnectionString("AuthDbConnection")
    ?? throw new InvalidOperationException("Missing AuthDbConnection.");

builder.Services.AddDbContext<UserAuthDbContext>(options =>
    options.UseSqlServer(userAuthConnectionString));

// -------------------------------------------------------
//  JWT AUTHENTICATION
// -------------------------------------------------------
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,

        ValidIssuer = configuration["Jwt:Issuer"],
        ValidAudience = configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(configuration["Jwt:Key"])
        ),

        NameClaimType = "UserId",
        RoleClaimType = ClaimTypes.Role
    };

    // ---------------------------
    // SIGNALR TOKEN FIX
    // ---------------------------
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var token = context.Request.Query["access_token"];

            // SignalR handshake fix
            if (!string.IsNullOrEmpty(token) &&
                context.HttpContext.Request.Path.StartsWithSegments("/hubs/notifications"))
            {
                context.Token = token;
            }

            return Task.CompletedTask;
        },

        OnAuthenticationFailed = context =>
        {
            Console.WriteLine("JWT ERROR: " + context.Exception.Message);
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// -------------------------------------------------------
//  CORS
// -------------------------------------------------------
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp", builder =>
    {
        builder
            .WithOrigins("http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// -------------------------------------------------------
//  CONTROLLERS + SWAGGER
// -------------------------------------------------------
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// -------------------------------------------------------
//  SERVICES
// -------------------------------------------------------
builder.Services.Configure<InfluxDbOptions>(configuration.GetSection("InfluxDb"));
builder.Services.AddSingleton<IInfluxDbConnectionService, InfluxDbConnectionService>();
builder.Services.AddScoped<IInfluxTelementryService, InfluxTelemetryService>();

builder.Services.AddScoped<BackfillService>();
builder.Services.AddScoped<IAssetHierarchyService, AssetHierarchyService>();
builder.Services.AddScoped<IAssetConfiguration, AssetConfigurationService>();
builder.Services.AddScoped<IMappingService, AssetMappingService>();
builder.Services.AddScoped<IEmailService, EmailService>();

builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddHostedService<ExpiredNotificationCleanupService>();
builder.Services.AddScoped<IAlertRepository, AlertRepository>();
builder.Services.AddScoped<IAlertAnalysisRepository, AlertAnalysisRepository>();


// Mapping Cache
builder.Services.AddSingleton<IMappingCache>(sp =>
{
    var factory = sp.GetRequiredService<IDbContextFactory<DBContext>>();
    return new MappingCache(factory);
});

// Background Tasks
builder.Services.AddHostedService<InfluxDbInitializationService>();
builder.Services.AddHostedService<TelemetryBackgroundService>();
builder.Services.AddHostedService<ReportGenerationService>();

builder.Services.AddSingleton<IAlertStateStore, MemoryAlertStateStore>();
builder.Services.AddSingleton<RabbitMqService>();

// -------------------------------------------------------
//  SIGNALR
// -------------------------------------------------------
builder.Services.AddSignalR();
builder.Services.AddSingleton<Microsoft.AspNetCore.SignalR.IUserIdProvider, NameIdentifierUserIdProvider>();
builder.Services.AddHttpClient();
builder.Services.AddHealthChecks();




// -------------------------------------------------------
//  BUILD APP
// -------------------------------------------------------
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<DBContext>();
    db.Database.Migrate();
}

app.UseSerilogRequestLogging();
app.MapHealthChecks("/health");

// -------------------------------------------------------
//  SWAGGER
// -------------------------------------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}





// -------------------------------------------------------
//  DB SEEDER
// -------------------------------------------------------
using (var scope = app.Services.CreateScope())
{
    var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<DBContext>>();
    using var db = factory.CreateDbContext();
    await SignalTypessSeeder.SeedAsync(db);
}

// -------------------------------------------------------
//  MIDDLEWARE FIX — Random 401 (COOKIE → HEADER)
// -------------------------------------------------------
app.Use(async (context, next) =>
{
    if (!context.Request.Headers.ContainsKey("Authorization"))
    {
        var token = context.Request.Cookies["access_token"];

        if (!string.IsNullOrWhiteSpace(token) &&
            token.Count(c => c == '.') == 2)
        {
            context.Request.Headers.Append("Authorization", "Bearer " + token);
        }
    }

    await next();
});



// -------------------------------------------------------
//  PIPELINE
// -------------------------------------------------------
app.UseHttpsRedirection();
app.UseCors("AllowReactApp");

app.UseAuthentication();
app.UseAuthorization();

// -------------------------------------------------------
//  SIGNALR HUB
// -------------------------------------------------------
app.MapHub<NotificationHub>("/api/hubs/notifications");

// -------------------------------------------------------
//  CONTROLLERS
// -------------------------------------------------------
app.MapControllers();

// Print all endpoints
var endpointDataSource = app.Services.GetRequiredService<EndpointDataSource>();
foreach (var endpoint in endpointDataSource.Endpoints)
    Console.WriteLine("ENDPOINT: " + endpoint.DisplayName);

app.Run();

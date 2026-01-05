using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Ocelot.DependencyInjection;
using Ocelot.Middleware;
using Gateway.Handlers;


var builder = WebApplication.CreateBuilder(args);

// ===================== Load Configurations =====================
builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile("ocelot.json", optional: false, reloadOnChange: true);

var jwtConfig = builder.Configuration.GetSection("Jwt");
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>();
var gatewayUrl = builder.Configuration["Gateway:Url"];

var jwtKey = jwtConfig["Key"];
var jwtIssuer = jwtConfig["Issuer"];
var jwtAudience = jwtConfig["Audience"];

if (string.IsNullOrWhiteSpace(jwtKey)) throw new InvalidOperationException("JWT Key is missing");
if (string.IsNullOrWhiteSpace(jwtIssuer)) throw new InvalidOperationException("JWT Issuer is missing");
if (string.IsNullOrWhiteSpace(jwtAudience)) throw new InvalidOperationException("JWT Audience is missing");
if (corsOrigins == null || corsOrigins.Length == 0) throw new InvalidOperationException("CORS AllowedOrigins is missing");

// ===================== Services =====================

// JWT Authentication
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
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

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
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

// Ocelot + DelegatingHandler to extract UserId
builder.Services.AddTransient<ClientIdFromJwtHandler>();
builder.Services.AddOcelot(builder.Configuration)
       .AddDelegatingHandler<ClientIdFromJwtHandler>(true); // applied to all routes

// Health Checks
builder.Services.AddHealthChecks();

// Bind Gateway URL
if (!string.IsNullOrWhiteSpace(gatewayUrl))
{
    builder.WebHost.UseUrls(gatewayUrl);
}

// ===================== Build App =====================
var app = builder.Build();

// ===================== Pipeline =====================
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


// Health endpoint
app.MapHealthChecks("/health");

// Ocelot must be last in pipeline
await app.UseOcelot();

app.Run();

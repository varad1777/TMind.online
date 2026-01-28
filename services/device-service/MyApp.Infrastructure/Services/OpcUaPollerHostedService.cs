using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace MyApp.Infrastructure.Services
{
    public class OpcUaPollerHostedService : BackgroundService
    {
        private readonly ILogger<OpcUaPollerHostedService> _logger;
        private readonly IConfiguration _config;

        private Session? _session;

        public OpcUaPollerHostedService(ILogger<OpcUaPollerHostedService> logger, IConfiguration config)
        {
            _logger = logger;
            _config = config;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("OPC UA Client started");

            try
            {
                await ConnectAsync(stoppingToken);
                await PollLoopAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("OPC UA Client stopping");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "OPC UA Client failed");
            }
            finally
            {
                if (_session != null)
                {
                    await _session.CloseAsync();
                    _session.Dispose();
                }
            }
        }

        private async Task ConnectAsync(CancellationToken ct)
        {
            string endpointUrl = _config.GetValue<string>("OpcUa:EndpointUrl")
                                 ?? "opc.tcp://localhost:4840/wmind/opcua";

            var config = new ApplicationConfiguration
            {
                ApplicationName = "MyApp.OpcUaClient",
                ApplicationUri = $"urn:{Environment.MachineName}:MyApp:OpcUaClient",
                ApplicationType = ApplicationType.Client,
                SecurityConfiguration = new SecurityConfiguration
                {
                    ApplicationCertificate = new CertificateIdentifier(),
                    AutoAcceptUntrustedCertificates = true
                },
                TransportConfigurations = new TransportConfigurationCollection(),
                TransportQuotas = new TransportQuotas { OperationTimeout = 15000 },
                ClientConfiguration = new ClientConfiguration { DefaultSessionTimeout = 60000 }
            };

            config.Validate(ApplicationType.Client);

            // Discover endpoints
            var discoveryUrl = new Uri(endpointUrl);
            var endpointConfiguration = EndpointConfiguration.Create(config);

            using (var discoveryClient = DiscoveryClient.Create(discoveryUrl, endpointConfiguration))
            {
                var endpoints = discoveryClient.GetEndpoints(null);
                var selectedEndpoint = endpoints.FirstOrDefault(e => e.SecurityMode == MessageSecurityMode.None)
                                    ?? endpoints.FirstOrDefault();

                if (selectedEndpoint == null)
                    throw new Exception("No endpoints found");

                var configuredEndpoint = new ConfiguredEndpoint(null, selectedEndpoint, endpointConfiguration);

                _session = await Session.Create(config, configuredEndpoint, false, "WMIND-Client", 60000, null, null, ct);
                _logger.LogInformation("Connected to OPC UA Server: {Url}", endpointUrl);
            }
        }

        private async Task PollLoopAsync(CancellationToken ct)
        {
            // Use numeric NodeIds from UaExpert
            var nodeIds = new List<NodeId>
            {
                // Machine1
                new NodeId(4, 2),  // Current
                new NodeId(8, 2),  // FlowRate
                new NodeId(6, 2),  // Frequency
                new NodeId(9, 2),  // RPM
                new NodeId(5, 2),  // Temperature
                new NodeId(10, 2),  // Torque
                new NodeId(7, 2),  // Vibration
                new NodeId(3, 2),  // Voltage

                // Machine2 
                new NodeId(13, 2),  // Current
                new NodeId(17, 2),  // FlowRate
                new NodeId(15, 2),  // Frequency
                new NodeId(18, 2),  // RPM
                new NodeId(14, 2),  // Temperature
                new NodeId(19, 2),  // Torque
                new NodeId(16, 2),  // Vibration
                new NodeId(12, 2),  // Voltage
            };

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    await ReadValuesAsync(nodeIds);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "OPC UA read failed");
                }

                await Task.Delay(200, ct);
            }
        }

        private async Task ReadValuesAsync(List<NodeId> nodeIds)
        {
            if (_session == null || !_session.Connected) return;

            var readList = new ReadValueIdCollection();
            foreach (var nodeId in nodeIds)
            {
                readList.Add(new ReadValueId
                {
                    NodeId = nodeId,
                    AttributeId = Attributes.Value
                });
            }

            var response = await _session.ReadAsync(
                null,
                0,
                TimestampsToReturn.Source,
                readList,
                CancellationToken.None);

            var results = response.Results;

            for (int i = 0; i < results.Count; i++)
            {
                var val = results[i].Value;
                var status = results[i].StatusCode;
                Console.WriteLine($"[OPC UA] {nodeIds[i]} = {val} (Status: {status})");
            }
        }
    }
}

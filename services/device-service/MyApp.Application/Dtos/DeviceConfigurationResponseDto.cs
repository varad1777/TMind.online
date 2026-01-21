using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace MyApp.Application.Dtos
{
    public class DeviceConfigurationResponseDto
    {
        public Guid DeviceId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Protocol { get; set; } = string.Empty;
        public int PollIntervalMs { get; set; }
        public string ProtocolSettingsJson { get; set; } = "{}";
        public List<SlaveDto> Slaves { get; set; } = new();
    }

    public class DeviceRegisterDto
    {
        public Guid RegisterId { get; set; }
        public int RegisterAddress { get; set; }
        public int RegisterLength { get; set; }
        public string DataType { get; set; } = string.Empty;
        public double Scale { get; set; }
        public string Unit { get; set; } = string.Empty;
        public string ByteOrder { get; set; } = string.Empty;
        public bool WordSwap { get; set; }
        public bool IsHealthy { get; set; }
    }

    public class SlaveDto
    {
        public Guid DeviceSlaveId { get; set; }
        public int SlaveIndex { get; set; }
        public bool IsHealthy { get; set; }
        public List<DeviceRegisterDto> Registers { get; set; } = new();
    }



}
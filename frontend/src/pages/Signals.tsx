import React, { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import type { HubConnection } from "@microsoft/signalr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TelemetryDto = {
  deviceId: string;
  deviceSlaveId: string;
  slaveIndex: number;
  registerAddress: number;
  signalType: string;
  value: number;
  unit: string;
  timestamp: string;
};

type RegisterState = {
  registerAddress: number;
  signalType: string;
  unit: string;
  history: number[];
  last: number;
};

type slaveState = {
  slaveIndex: number;
  registers: Map<number, RegisterState>;
};

type DeviceState = {
  slaves: Map<number, slaveState>;
  lastUpdate: number | null;
};

type DevicesMap = Map<string, DeviceState>;
type SelectedDevice = { deviceId: string; name: string };

const SESSION_KEY = "selectedDeviceIds";
const CONNECT_TIMEOUT_MS = 7000;
const TELEMETRY_CACHE_KEY = "telemetryCache";
const MAX_HISTORY = 100;
const PERSIST_DEBOUNCE_MS = 1000;

export default function Signals({ hubUrl = "0/devices/hubs/modbus" }: { hubUrl?: string }) {
  const [connection, setConnection] = useState<HubConnection | null>(null);
  const [devices, setDevices] = useState<DevicesMap>(() => new Map());
  const [deviceNames, setDeviceNames] = useState<Map<string, string>>(() => new Map());
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(new Set());
  const [expandedslaves, setExpandedslaves] = useState<Set<string>>(new Set());
  const connRef = useRef<HubConnection | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupErrorDetail, setStartupErrorDetail] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const prevDeviceIdsRef = useRef<string[]>([]);
  const persistTimerRef = useRef<number | null>(null);
  const [noSelectedIDs, setNoSelectedIDs] = useState<boolean>(false);

  let navigate = useNavigate();

  // Persistence helpers
  function serializeDevicesMap(dm: DevicesMap) {
    const out: Record<string, any> = {};
    for (const [deviceId, dev] of dm.entries()) {
      out[deviceId] = {
        lastUpdate: dev.lastUpdate,
        slaves: {},
      };
      for (const [slaveIndex, slave] of dev.slaves.entries()) {
        out[deviceId].slaves[slaveIndex] = {
          slaveIndex: slave.slaveIndex,
          registers: {},
        };
        for (const [regAddr, reg] of slave.registers.entries()) {
          out[deviceId].slaves[slaveIndex].registers[regAddr] = {
            registerAddress: reg.registerAddress,
            signalType: reg.signalType,
            unit: reg.unit,
            history: reg.history.slice(-MAX_HISTORY),
            last: reg.last,
          };
        }
      }
    }
    return JSON.stringify(out);
  }

  function deserializeDevicesMap(raw: string | null): DevicesMap {
    const dm: DevicesMap = new Map();
    if (!raw) return dm;
    try {
      const parsed = JSON.parse(raw);
      for (const deviceId of Object.keys(parsed)) {
        const devObj = parsed[deviceId];
        const slavesMap = new Map<number, slaveState>();
        const slaves = devObj.slaves || {};
        
        for (const slaveKey of Object.keys(slaves)) {
          const slaveIndex = Number(slaveKey);
          const slaveObj = slaves[slaveKey];
          const registersMap = new Map<number, RegisterState>();
          const registers = slaveObj.registers || {};
          
          for (const regKey of Object.keys(registers)) {
            const regAddr = Number(regKey);
            const reg = registers[regKey];
            registersMap.set(regAddr, {
              registerAddress: reg.registerAddress,
              signalType: reg.signalType || "",
              unit: reg.unit || "",
              history: Array.isArray(reg.history) ? reg.history.slice(-MAX_HISTORY) : [],
              last: typeof reg.last === "number" ? reg.last : 0,
            });
          }
          
          slavesMap.set(slaveIndex, {
            slaveIndex,
            registers: registersMap,
          });
        }
        
        dm.set(deviceId, { 
          slaves: slavesMap, 
          lastUpdate: devObj.lastUpdate ?? Date.now() 
        });
      }
    } catch (e) {
      console.warn("Failed to deserialize telemetry cache", e);
    }
    return dm;
  }

  function persistTelemetry(dm?: DevicesMap) {
    if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      try {
        const toSave = serializeDevicesMap(dm ?? devices);
        sessionStorage.setItem(TELEMETRY_CACHE_KEY, toSave);
      } catch (e) {
        console.warn("Failed to persist telemetry", e);
      } finally {
        persistTimerRef.current = null;
      }
    }, PERSIST_DEBOUNCE_MS);
  }

  function readSelectedDevices(): SelectedDevice[] {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw === "") {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
        return [];
      }
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x) => {
          if (x && typeof x === "object") {
            const id = String((x as any).deviceId ?? (x as any).id ?? "");
            const name = String((x as any).name ?? (x as any).displayName ?? "");
            if (id) return { deviceId: id, name };
          }
          return null;
        })
        .filter((x): x is SelectedDevice => x !== null);
    } catch {
      return [];
    }
  }

  function readSelectedDeviceIds(): string[] {
    return readSelectedDevices().map(d => d.deviceId);
  }

  async function clearSelectionAndReset(redirectToDevices = false) {
    const ids = readSelectedDeviceIds();
    for (const id of ids) {
      try {
        await connRef.current?.invoke("UnsubscribeFromDevice", id);
      } catch (err) {
        console.warn("Failed to unsubscribe during clear:", id, err);
      }
    }

    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    try { sessionStorage.removeItem(TELEMETRY_CACHE_KEY); } catch {}

    setDevices(new Map());
    setDeviceNames(new Map());
    prevDeviceIdsRef.current = [];
    setNoSelectedIDs(true);

    if (redirectToDevices) {
      window.location.href = "/devices";
    }
  }

  // Mount: load selected + telemetry
  useEffect(() => {
    const selected = readSelectedDevices();
    prevDeviceIdsRef.current = selected.map(s => s.deviceId);

    if (!selected.length) {
      setDevices(new Map());
      setDeviceNames(new Map());
      setNoSelectedIDs(true);
      return;
    }

    const cached = sessionStorage.getItem(TELEMETRY_CACHE_KEY);
    if (cached) {
      const dm = deserializeDevicesMap(cached);
      if (dm && dm.size) {
        const filtered = new Map<string, DeviceState>();
        for (const s of selected) {
          if (dm.has(s.deviceId)) filtered.set(s.deviceId, dm.get(s.deviceId)!);
          else filtered.set(s.deviceId, { slaves: new Map<number, slaveState>(), lastUpdate: null });
        }
        setDevices(filtered);
      } else {
        const initialPanels = new Map<string, DeviceState>();
        for (const s of selected) initialPanels.set(s.deviceId, { slaves: new Map<number, slaveState>(), lastUpdate: null });
        setDevices(initialPanels);
      }
    } else {
      const initialPanels = new Map<string, DeviceState>();
      for (const s of selected) initialPanels.set(s.deviceId, { slaves: new Map<number, slaveState>(), lastUpdate: null });
      setDevices(initialPanels);
    }

    setDeviceNames(prev => {
      const next = new Map(prev);
      for (const s of selected) next.set(s.deviceId, s.name || s.deviceId);
      return next;
    });
    setNoSelectedIDs(false);
  }, []);

  // Track device unsubscriptions
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const currentStoredIds = readSelectedDeviceIds();
      const prevIds = prevDeviceIdsRef.current;
      
      if (prevIds.length === 0 && currentStoredIds.length === 0) return;

      const removed = prevIds.filter(id => !currentStoredIds.includes(id));

      if (removed.length > 0 && connRef.current) {
        removed.forEach(async (id) => {
          try {
            await connRef.current?.invoke("UnsubscribeFromDevice", id);
            setDevices(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
            setDeviceNames(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          } catch (err) {
            console.error("Failed to unsubscribe from device:", id, err);
          }
        });
      }

      prevDeviceIdsRef.current = currentStoredIds;
    }, 1000);

    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    prevDeviceIdsRef.current = [...devices.keys()];
  }, [devices]);

  // SignalR connection setup
  useEffect(() => {
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    

    connRef.current = conn;
    setConnection(conn);

    // Setup TelemetryUpdate handler
    conn.off("TelemetryUpdate");
    conn.on("TelemetryUpdate", (payload: TelemetryDto[] | any) => {
      if (!Array.isArray(payload) || payload.length === 0) return;
      
      const first = payload[0];
      const deviceId = (first.deviceId ?? first.DeviceId) as string;
      if (!deviceId) return;

      console.log(`TelemetryUpdate for ${deviceId}:`, payload);

      setDevices(prev => {
        const next = new Map(prev);
        const dev = next.get(deviceId) ?? { slaves: new Map<number, slaveState>(), lastUpdate: Date.now() };

        for (const itemRaw of payload) {
          const item = {
            deviceId: itemRaw.deviceId ?? itemRaw.DeviceId,
            deviceSlaveId: itemRaw.deviceSlaveId ?? itemRaw.deviceSlaveId,
            slaveIndex: itemRaw.slaveIndex ?? itemRaw.slaveIndex,
            registerAddress: itemRaw.registerAddress ?? itemRaw.RegisterAddress,
            signalType: itemRaw.signalType ?? itemRaw.SignalType,
            value: itemRaw.value ?? itemRaw.Value,
            unit: itemRaw.unit ?? itemRaw.Unit,
            timestamp: itemRaw.timestamp ?? itemRaw.Timestamp
          };

          const slaveIndex = Number(item.slaveIndex ?? -1);
          const registerAddress = Number(item.registerAddress ?? 0);
          const value = Number(item.value ?? 0);
          const unit = String(item.unit ?? "");
          const signalType = String(item.signalType ?? "");

          if (slaveIndex < 0 || registerAddress === 0) continue;

          // Get or create slave
          let slave = dev.slaves.get(slaveIndex);
          if (!slave) {
            slave = { slaveIndex, registers: new Map<number, RegisterState>() };
            dev.slaves.set(slaveIndex, slave);
          }

          // Get or create register
          let register = slave.registers.get(registerAddress);
          if (!register) {
            register = {
              registerAddress,
              signalType,
              unit,
              history: [],
              last: value,
            };
            slave.registers.set(registerAddress, register);
          }

          // Update register
          register.history.push(value);
          if (register.history.length > MAX_HISTORY) register.history.shift();
          register.last = value;
          register.unit = unit;
          register.signalType = signalType;
        }

        dev.lastUpdate = Date.now();
        next.set(deviceId, dev);
        persistTelemetry(next);
        return next;
      });
    });

    // Start connection and auto-subscribe
    (async () => {
      const storedIds = readSelectedDeviceIds();
      if (!storedIds.length) {
        setDevices(new Map());
        setDeviceNames(new Map());
        setNoSelectedIDs(true);
        return;
      }

      const startPromise = conn.start();
      const timeoutPromise = new Promise<never>((_, rej) => 
        setTimeout(() => rej(new Error("connect-timeout")), CONNECT_TIMEOUT_MS)
      );
      
      try {
        await Promise.race([startPromise, timeoutPromise]);
        setStartupError(null);
        setStartupErrorDetail(null);
        console.log("SignalR connected");
      } catch (startErr: any) {
        
         if (String(startErr).includes("401")) {
           navigate("/")
           }

        console.error("SignalR failed to start", startErr);
        setStartupError("Failed to connect to realtime server. Check server/network and press Retry or go back to device list.");
        setStartupErrorDetail(String(startErr?.message || startErr));
        return;
      }

      // Subscribe to devices
      for (const id of storedIds) {
        try {
          await conn.invoke("SubscribeToDevice", id);
          console.log("Subscribed to device:", id);
          
          setDevices(prev => {
            const next = new Map(prev);
            if (!next.has(id)) next.set(id, { slaves: new Map<number, slaveState>(), lastUpdate: null });
            return next;
          });
          
          const stored = readSelectedDevices().find(s => s.deviceId === id);
          if (stored?.name) {
            setDeviceNames(prev => {
              const next = new Map(prev);
              next.set(id, stored.name);
              return next;
            });
          }
        } catch (subErr) {
          console.warn("Failed to subscribe to device", id, subErr);
        }
      }
    })();

    // Setup onclose handler
    conn.onclose((err?: any) => {
      console.warn("SignalR connection closed", err);
      const stored = readSelectedDeviceIds();
      if (stored.length) {
        setStartupError("Realtime connection closed. You can Retry or go back to device list.");
        setStartupErrorDetail(String(err ?? ""));
      }
    });

    return () => {
      try { conn.off("TelemetryUpdate"); } catch {}
      conn.stop().catch(() => {});
      connRef.current = null;
      setConnection(null);
      setDevices(new Map());
      setDeviceNames(new Map());
    };
  }, [hubUrl]);

  async function handleRetry() {
    if (!connRef.current) return;
    setIsRetrying(true);
    setStartupError(null);
    setStartupErrorDetail(null);

    try {
      const startPromise = connRef.current.start();
      const timeoutPromise = new Promise<never>((_, rej) => 
        setTimeout(() => rej(new Error("connect-timeout")), CONNECT_TIMEOUT_MS)
      );
      await Promise.race([startPromise, timeoutPromise]);

      const ids = readSelectedDeviceIds();
      for (const id of ids) {
        try {
          await connRef.current.invoke("SubscribeToDevice", id);
          setDevices(prev => {
            const next = new Map(prev);
            if (!next.has(id)) next.set(id, { slaves: new Map<number, slaveState>(), lastUpdate: null });
            return next;
          });
        } catch (err) {
          console.warn("Retry: failed to subscribe", id, err);
        }
      }
      setStartupError(null);
      setStartupErrorDetail(null);
    } catch (err: any) {
  
      console.error("Retry failed", err);
      setStartupError("Retry failed — still cannot connect. Check server/network and try again.");
      setStartupErrorDetail(String(err?.message || err));
    } finally {
      setIsRetrying(false);
    }
  }

  function getDeviceDisplayName(deviceId: string) {
    return deviceNames.get(deviceId) ?? deviceId;
  }

  function toggleDevice(deviceId: string) {
    setExpandedDevices(prev => {
      const next = new Set(prev);
      if (next.has(deviceId)) next.delete(deviceId);
      else next.add(deviceId);
      return next;
    });
  }

  function toggleslave(deviceId: string, slaveIndex: number) {
    const key = `${deviceId}:${slaveIndex}`;
    setExpandedslaves(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function renderSparkline(values: number[] | undefined) {
    if (!values || values.length === 0) return null;
    const w = 100, h = 30, len = values.length;
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max === min) ? (Math.abs(max) || 1) : (max - min);
    const points = values.map((v, i) => {
      const x = (i / Math.max(1, len - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg width={w} height={h} className="inline-block" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <polyline points={points} fill="none" strokeWidth={2} className="stroke-blue-500" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-600" />
              Device Signals Monitor
            </h1>
            <p className="text-slate-600 mt-1">Real-time telemetry organized by slaves and registers</p>
          </div>
        </div>

        {startupError && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-yellow-900">Connection Error</p>
                <p className="text-sm text-yellow-700 mt-1">{startupError}</p>
                {startupErrorDetail && (
                  <p className="text-xs text-yellow-600 mt-2">Details: {startupErrorDetail}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Button onClick={handleRetry} disabled={isRetrying} size="sm">
                    {isRetrying ? "Retrying..." : "Retry Connection"}
                  </Button>
                  <Button onClick={() => clearSelectionAndReset(true)} variant="outline" size="sm">
                    Back to Devices
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {noSelectedIDs && (
          <Card className="border-slate-200 shadow-lg">
            <CardContent className="py-16">
              <div className="text-center text-slate-500">
                <Database className="w-20 h-20 mx-auto mb-4 text-slate-300" />
                <p className="text-xl font-medium text-slate-700">No Devices Selected</p>
                <p className="text-sm mt-2">Subscribe to devices from the Devices page to view real-time signals</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {[...devices.entries()].map(([deviceId, dev]) => {
            const isDeviceExpanded = expandedDevices.has(deviceId);
            const slaveCount = dev.slaves.size;
            const totalRegisters = [...dev.slaves.values()].reduce((sum, slave) => sum + slave.registers.size, 0);

            return (
              <Card key={deviceId} className="border-slate-200 shadow-lg overflow-hidden">
                <CardHeader 
                  className="cursor-pointer hover:bg-slate-50 transition-colors border-b bg-gradient-to-r from-slate-50 to-blue-50"
                  onClick={() => toggleDevice(deviceId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isDeviceExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      )}
                      <div>
                        <CardTitle className="text-xl font-semibold text-slate-900">
                          {getDeviceDisplayName(deviceId)}
                        </CardTitle>
                        <p className="text-sm text-slate-600 mt-1">
                          {slaveCount} slave{slaveCount !== 1 ? 's' : ''} • {totalRegisters} register{totalRegisters !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                      <span className="text-sm text-slate-600">Live</span>
                    </div>
                  </div>
                </CardHeader>

                {isDeviceExpanded && (
                  <CardContent className="p-0">
                    {dev.slaves.size === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <p>No telemetry data received yet</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {[...dev.slaves.entries()].map(([slaveIndex, slave]) => {
                          const isslaveExpanded = expandedslaves.has(`${deviceId}:${slaveIndex}`);
                          const registerCount = slave.registers.size;

                          return (
                            <div key={slaveIndex}>
                              <div
                                className="p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => toggleslave(deviceId, slaveIndex)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {isslaveExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-slate-600" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-slate-600" />
                                    )}
                                    <div>
                                      <h3 className="font-semibold text-slate-900">slave {slaveIndex}</h3>
                                      <p className="text-xs text-slate-600 mt-0.5">
                                        {registerCount} register{registerCount !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {isslaveExpanded && (
                                <div className="p-6 bg-white">
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-gradient-to-r from-slate-100 to-slate-50">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Register Address
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Signal Type
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Current Value
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Unit
                                          </th>
                                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            Trend
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200">
                                        {[...slave.registers.entries()].map(([regAddr, reg]) => (
                                          <tr key={regAddr} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-4 text-sm font-mono font-medium text-slate-900">
                                              {reg.registerAddress}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-slate-700">
                                              {reg.signalType || "—"}
                                            </td>
                                            <td className="px-4 py-4 text-sm font-mono font-semibold text-blue-600">
                                              {typeof reg.last === "number" ? reg.last.toFixed(2) : "—"}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-slate-700">
                                              {reg.unit || "—"}
                                            </td>
                                            <td className="px-4 py-4">
                                              {renderSparkline(reg.history)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
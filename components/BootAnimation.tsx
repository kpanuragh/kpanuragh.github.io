'use client';

import { useEffect, useState } from 'react';

const bootMessages = [
  "Found 0x55aa...",
  "Loading kernel...",
  "Initializing drivers...",
  "Mounting filesystems...",
  "Configuring network interfaces...",
  "Setting up user environment...",
  "Starting services...",
  "Loading user profiles...",
  "Boot complete!"
];

const logMessages = [
  "[kernel] Initializing system hardware...",
  "[systemd] Mounting root file system...",
  "[network] Detecting network interfaces...",
  "[syslog] Starting logging daemon...",
  "[auth] Loading authentication modules...",
  "[init] Configuring environment variables...",
  "[app] Starting application services...",
  "[user] Welcome, user!"
];

export default function BootAnimation() {
  const [bootIndex, setBootIndex] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (bootIndex >= bootMessages.length) {
      setTimeout(() => {
        setIsComplete(true);
      }, 2000);
      return;
    }

    const getRandomDelay = () => Math.random() * (1500 - 800) + 800;

    const timer = setTimeout(() => {
      // Add log message
      const logMsg = bootIndex < logMessages.length
        ? logMessages[bootIndex]
        : logMessages[Math.floor(Math.random() * logMessages.length)];

      setLogs(prev => [...prev, logMsg]);

      // Move to next boot message
      setBootIndex(prev => prev + 1);
    }, getRandomDelay());

    return () => clearTimeout(timer);
  }, [bootIndex]);

  if (isComplete) {
    return null;
  }

  return (
    <>
      <div className="boot-animation terminal-card p-6 text-white">
        <p className="text-lg">
          {bootMessages[Math.min(bootIndex, bootMessages.length - 1)]}
        </p>
      </div>

      <div className="log-container terminal-card p-4">
        {logs.slice(-3).map((log, index) => (
          <div key={index} className="log-message text-sm text-terminal-text">
            {log}
          </div>
        ))}
      </div>

      {!isComplete && (
        <div className="fixed inset-0 bg-terminal-bg z-40" />
      )}
    </>
  );
}

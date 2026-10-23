import React, { useState } from 'react';
import { Copy, Check, Download, Terminal, Cloud, Server, FileCode, CheckCircle2 } from 'lucide-react';

export const CodeExportView: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>('app.py');
  const [copied, setCopied] = useState<boolean>(false);

  // File contents preview
  const files: Record<string, { desc: string; code: string }> = {
    'app.py': {
      desc: 'FastAPI REST backend with CORS, tick loop, order placement, and Console ledger CSV download',
      code: `"""
KiteFO FastAPI Backend
Run with: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
"""
import asyncio, csv, io, time
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import init_db, get_db_connection, get_account_state, reset_account_capital
from engine import market_feed, validate_rms_for_order, check_and_execute_daily_circuit_breaker

app = FastAPI(title="KiteFO Trading Platform API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    init_db()
    asyncio.create_task(ticker_loop())

async def ticker_loop():
    while True:
        market_feed.tick_drift()
        check_and_execute_daily_circuit_breaker()
        await asyncio.sleep(1.0)

# Refer to /app.py in root workspace for full source
`
    },
    'engine.py': {
      desc: 'Black-Scholes pricing, Greeks, SPAN margin, Hedge benefit discount, and 1% RMS risk controls',
      code: `"""
Quantitative F&O Engine & RMS System
Contains Black-Scholes formula, Greeks (Delta, Gamma, Theta, Vega),
and SPAN margin calculation with dynamic Hedge benefits.
"""
import math, time, random

def black_scholes_price(spot, strike, time_to_expiry_years, volatility, option_type="CE"):
    d1 = (math.log(spot / strike) + (0.07 + 0.5 * volatility**2) * time_to_expiry_years) / (volatility * math.sqrt(time_to_expiry_years))
    d2 = d1 - volatility * math.sqrt(time_to_expiry_years)
    # Full formulas in /engine.py
`
    },
    'database.py': {
      desc: 'SQLite WAL mode schema for single-user accounts, orders, positions, and double-entry ledger',
      code: `"""
SQLite Database Layer with WAL mode for zero-latency concurrent reads.
"""
import sqlite3, os

def get_db_connection():
    conn = sqlite3.connect(os.getenv("DB_PATH", "trading.db"), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn
`
    },
    'requirements.txt': {
      desc: 'Python package dependencies for production runtime',
      code: `fastapi>=0.110.0
uvicorn>=0.28.0
pydantic>=2.6.0
requests>=2.31.0
pyotp>=2.9.0
numpy>=1.26.0
scipy>=1.12.0
smartapi-python>=1.4.0
`
    },
    'render.yaml': {
      desc: 'Render.com 1-click blueprint configuration with persistent SQLite storage disk',
      code: `services:
  - type: web
    name: kitefo-trading-platform
    env: python
    region: oregon
    plan: free
    buildCommand: "pip install -r requirements.txt"
    startCommand: "uvicorn app:app --host 0.0.0.0 --port $PORT"
    envVars:
      - key: PYTHON_VERSION
        value: 3.10.12
      - key: DB_PATH
        value: /var/data/trading.db
    disk:
      name: trading-data
      mountPath: /var/data
      sizeGB: 1
`
    },
    'Dockerfile': {
      desc: 'Docker container recipe for Railway or any container host',
      code: `FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
`
    }
  };

  const copyCurrentFile = () => {
    navigator.clipboard.writeText(files[selectedFile].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (fileName: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none overflow-y-auto p-4 lg:p-6 space-y-6">
      
      {/* Title & Deployment Overview */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#e5e5e5]">
        <div>
          <h2 className="text-base font-bold text-[#333] flex items-center gap-2">
            <Server className="w-5 h-5 text-[#387ed1]" />
            Python FastAPI Backend & 1-Click Cloud Deployment
          </h2>
          <p className="text-xs text-[#666]">
            Every Python file requested is authored in the repository root directory. You can inspect, copy, or deploy them directly.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadFile(selectedFile, files[selectedFile].code)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#387ed1] hover:bg-blue-50 border border-[#387ed1]/30 rounded transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {selectedFile}</span>
          </button>
        </div>
      </div>

      {/* Deployment Cards: Local vs Render vs Railway */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Local */}
        <div className="p-4 rounded border border-[#e0e0e0] bg-[#fbfbfb] space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#333]">
            <Terminal className="w-4 h-4 text-[#387ed1]" />
            <span>Run Locally</span>
          </div>
          <p className="text-[11px] text-[#666]">
            Install Python dependencies and start Uvicorn with auto-reload:
          </p>
          <pre className="p-2.5 bg-[#222] text-[#e0e0e0] rounded font-mono text-[10px] overflow-x-auto">
            pip install -r requirements.txt{'\n'}
            uvicorn app:app --port 8000 --reload
          </pre>
        </div>

        {/* Render.com */}
        <div className="p-4 rounded border border-[#e0e0e0] bg-[#fbfbfb] space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#333]">
            <Cloud className="w-4 h-4 text-[#387ed1]" />
            <span>Render.com (1-Click)</span>
          </div>
          <p className="text-[11px] text-[#666]">
            Uses <code className="bg-[#eee] px-1 rounded">render.yaml</code> Blueprint with persistent SQLite disk:
          </p>
          <ol className="list-decimal list-inside text-[11px] text-[#555] space-y-1">
            <li>Push repository to GitHub.</li>
            <li>In Render, select <b>New + Blueprint</b>.</li>
            <li>Auto-detects disk & build command.</li>
          </ol>
        </div>

        {/* Railway */}
        <div className="p-4 rounded border border-[#e0e0e0] bg-[#fbfbfb] space-y-2">
          <div className="flex items-center gap-2 font-bold text-[#333]">
            <Server className="w-4 h-4 text-[#387ed1]" />
            <span>Railway / Docker</span>
          </div>
          <p className="text-[11px] text-[#666]">
            Uses the bundled <code className="bg-[#eee] px-1 rounded">Dockerfile</code>:
          </p>
          <ol className="list-decimal list-inside text-[11px] text-[#555] space-y-1">
            <li>Create project on Railway.app.</li>
            <li>Select <b>Deploy from Repo</b>.</li>
            <li>Add persistent volume for SQLite DB.</li>
          </ol>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="border border-[#e0e0e0] rounded overflow-hidden">
        {/* File Tabs */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#f8f9fa] border-b border-[#e0e0e0] overflow-x-auto">
          <div className="flex items-center gap-1">
            {Object.keys(files).map((f) => (
              <button
                key={f}
                onClick={() => setSelectedFile(f)}
                className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap ${
                  selectedFile === f
                    ? 'bg-white text-[#387ed1] border border-[#d0d0d0] shadow-2xs font-semibold'
                    : 'text-[#666] hover:text-[#222]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={copyCurrentFile}
            className="flex items-center gap-1 px-3 py-1 text-xs text-[#555] hover:text-[#222] bg-white border border-[#d0d0d0] rounded hover:bg-[#f0f0f0] transition-colors shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#4caf50]" />
                <span className="text-[#4caf50]">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy File</span>
              </>
            )}
          </button>
        </div>

        {/* Description Header */}
        <div className="px-4 py-2 bg-[#fafafa] border-b border-[#eee] text-xs text-[#666]">
          {files[selectedFile].desc}
        </div>

        {/* Code Content */}
        <div className="p-4 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs overflow-x-auto max-h-96">
          <pre>{files[selectedFile].code}</pre>
        </div>
      </div>
    </div>
  );
};

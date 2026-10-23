import React, { useState } from 'react';
import { LedgerItem } from '../types/trading';
import { Download, FileText, Calendar, Filter, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface LedgerTabProps {
  ledger: LedgerItem[];
}

export const LedgerTab: React.FC<LedgerTabProps> = ({ ledger }) => {
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredEntries = filterType === 'ALL'
    ? ledger
    : ledger.filter((l) => l.voucherType === filterType);

  const downloadCSV = () => {
    const headers = ['ID', 'Date Time', 'Particulars', 'Voucher Type', 'Debit (INR)', 'Credit (INR)', 'Running Balance (INR)', 'Reference'];
    const rows = filteredEntries.map((e) => [
      e.id,
      `"${new Date(e.timestamp).toLocaleString('en-IN')}"`,
      `"${e.particulars.replace(/"/g, '""')}"`,
      e.voucherType,
      e.debit.toFixed(2),
      e.credit.toFixed(2),
      e.runningBalance.toFixed(2),
      e.referenceId || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Zerodha_Console_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none">
      
      {/* Subheader with Console Branding, Filter & CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#387ed1]" />
          <span className="text-xs font-bold text-[#333]">Console Financial Ledger</span>
          <span className="text-[11px] text-[#888] hidden sm:inline">
            · Double-entry statement of transactions & bookings
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 text-xs">
            {['ALL', 'TRADE', 'REALIZED_PNL', 'DEPOSIT'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  filterType === type
                    ? 'bg-[#387ed1] text-white shadow-2xs'
                    : 'bg-white text-[#666] hover:bg-[#f0f0f0] border border-[#e0e0e0]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#387ed1] hover:bg-blue-50 border border-[#387ed1]/30 rounded transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[#888]">
            <FileText className="w-10 h-10 text-[#d0d0d0] mb-2 stroke-1" />
            <p className="text-sm font-semibold text-[#555]">No ledger entries</p>
            <p className="text-xs text-[#999] mt-1">
              Transactions, fund allocations, and realized P&L settlements will be recorded here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f8f9fa] text-[#666] font-semibold border-b border-[#e5e5e5] text-[11px]">
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">Particulars</th>
                <th className="py-2.5 px-3">Voucher Type</th>
                <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                <th className="py-2.5 px-4 text-right">Net Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {filteredEntries.map((item) => (
                <tr key={item.id} className="hover:bg-[#f9fbfd] transition-colors">
                  <td className="py-3 px-4 tabular-nums text-[#666] text-[11px] whitespace-nowrap">
                    {new Date(item.timestamp).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>

                  <td className="py-3 px-4 font-medium text-[#333] max-w-md">
                    {item.particulars}
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#f0f0f0] text-[#555]">
                      {item.voucherType}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right tabular-nums text-[#df514c] font-medium">
                    {item.debit > 0 ? `₹${item.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                  </td>

                  <td className="py-3 px-3 text-right tabular-nums text-[#4caf50] font-medium">
                    {item.credit > 0 ? `₹${item.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                  </td>

                  <td className="py-3 px-4 text-right tabular-nums font-bold text-[#222]">
                    ₹{item.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

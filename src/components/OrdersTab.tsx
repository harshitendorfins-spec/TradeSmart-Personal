import React, { useState } from 'react';
import { OrderItem } from '../types/trading';
import { CheckCircle2, XCircle, Clock, Ban, Filter, AlertCircle, Edit3, X, ShieldAlert, Target } from 'lucide-react';

interface OrdersTabProps {
  orders: OrderItem[];
  onCancelOrder?: (orderId: string) => void;
  onModifyOrder?: (orderId: string, newPrice: number, newQuantity: number) => void;
}

export const OrdersTab: React.FC<OrdersTabProps> = ({ orders, onCancelOrder, onModifyOrder }) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  
  // Modify Modal state
  const [editingOrder, setEditingOrder] = useState<OrderItem | null>(null);
  const [modifyPrice, setModifyPrice] = useState<string>('');
  const [modifyQty, setModifyQty] = useState<string>('');

  const filteredOrders = filterStatus === 'ALL'
    ? orders
    : orders.filter((o) => o.status === filterStatus);

  const openOrdersCount = orders.filter((o) => o.status === 'OPEN').length;

  const handleOpenModify = (order: OrderItem) => {
    setEditingOrder(order);
    setModifyPrice(order.price.toString());
    setModifyQty(order.quantity.toString());
  };

  const handleSaveModify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder || !onModifyOrder) return;
    const p = parseFloat(modifyPrice);
    const q = parseInt(modifyQty, 10);
    if (!p || p <= 0 || !q || q <= 0) {
      alert('Please enter valid positive price and quantity.');
      return;
    }
    onModifyOrder(editingOrder.id, p, q);
    setEditingOrder(null);
  };

  return (
    <div className="flex flex-col h-full bg-white select-none">
      
      {/* Subheader Filters */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-[#387ed1]" />
          <span className="text-xs font-semibold text-[#555]">Filter:</span>
          {[
            { key: 'ALL', label: `All (${orders.length})` },
            { key: 'OPEN', label: `Pending / Open (${openOrdersCount})` },
            { key: 'COMPLETE', label: 'Executed' },
            { key: 'REJECTED', label: 'Rejected' },
            { key: 'CANCELLED', label: 'Cancelled' },
          ].map((status) => (
            <button
              key={status.key}
              onClick={() => setFilterStatus(status.key)}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                filterStatus === status.key
                  ? 'bg-[#0284c7] text-white shadow-2xs'
                  : 'bg-white text-[#64748b] hover:bg-[#f1f5f9] border border-[#cbd5e1]'
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-[#888]">
            <Clock className="w-10 h-10 text-[#d0d0d0] mb-2 stroke-1" />
            <p className="text-sm font-semibold text-[#555]">No orders found</p>
            <p className="text-xs text-[#999] mt-1">
              Stop loss, target limits, pending executions, and risk-rejected orders will appear here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f8f9fa] text-[#666] font-semibold border-b border-[#e5e5e5] text-[11px]">
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Instrument</th>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Price (₹)</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-4">Notes / Execution Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f0]">
              {filteredOrders.map((order) => {
                const isBuy = order.transactionType === 'BUY';
                return (
                  <tr key={order.id} className="hover:bg-[#f9fbfd] transition-colors">
                    <td className="py-3 px-4 tabular-nums text-[#666] text-[11px]">
                      {new Date(order.placedAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isBuy ? 'bg-[#e8f1fb] text-[#387ed1]' : 'bg-[#fdeee9] text-[#ff5722]'
                          }`}
                        >
                          {order.transactionType}
                        </span>
                        {order.isStopLoss && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            SL
                          </span>
                        )}
                        {order.isTarget && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
                            <Target className="w-2.5 h-2.5" />
                            TGT
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#333]">{order.symbol}</span>
                        <span className="text-[10px] text-[#888]">{order.strategyTag}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-[11px] font-medium text-[#555]">{order.product}</span>
                    </td>

                    <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#333]">
                      {order.quantity}
                    </td>

                    <td className="py-3 px-3 text-right tabular-nums text-[#444] font-bold">
                      ₹{order.price.toFixed(2)}
                    </td>

                    <td className="py-3 px-3">
                      {order.status === 'COMPLETE' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#16a34a]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          COMPLETE
                        </span>
                      )}
                      {order.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#dc2626]">
                          <XCircle className="w-3.5 h-3.5" />
                          REJECTED
                        </span>
                      )}
                      {order.status === 'OPEN' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ea580c] px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          OPEN / PENDING
                        </span>
                      )}
                      {order.status === 'CANCELLED' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#64748b]">
                          <Ban className="w-3.5 h-3.5" />
                          CANCELLED
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-[#666] text-[11px] max-w-xs">
                      {order.statusMessage || (order.status === 'OPEN' ? `Waiting for LTP to hit ₹${order.price.toFixed(2)}` : 'Executed')}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {order.status === 'OPEN' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenModify(order)}
                            title="Modify Pending Order"
                            className="px-2.5 py-1 text-[11px] font-bold text-sky-700 hover:text-white bg-sky-50 hover:bg-sky-600 border border-sky-300 rounded transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            Modify
                          </button>
                          <button
                            onClick={() => onCancelOrder?.(order.id)}
                            title="Cancel Order"
                            className="px-2.5 py-1 text-[11px] font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 rounded transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modify Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-sm p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-sm text-[#0f172a] flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4 text-[#0284c7]" />
                  Modify Pending Order
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {editingOrder.isStopLoss ? 'Stop Loss Trigger Order' : editingOrder.isTarget ? 'Target Limit Order' : 'Limit Pending Order'}
                </p>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Instrument:</span>
                <span className="font-bold text-slate-800">{editingOrder.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Action:</span>
                <span className={`font-bold ${editingOrder.transactionType === 'BUY' ? 'text-sky-600' : 'text-orange-600'}`}>
                  {editingOrder.transactionType} ({editingOrder.product})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Strategy Setup:</span>
                <span className="font-medium text-slate-700">{editingOrder.strategyTag}</span>
              </div>
            </div>

            <form onSubmit={handleSaveModify} className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Order Trigger / Limit Price (₹) *
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={modifyPrice}
                  onChange={(e) => setModifyPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold tabular-nums text-slate-900 focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  step="1"
                  value={modifyQty}
                  onChange={(e) => setModifyQty(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-bold tabular-nums text-slate-900 focus:border-[#0284c7] focus:ring-1 focus:ring-[#0284c7] outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0284c7] hover:bg-[#0369a1] rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Confirm & Modify Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

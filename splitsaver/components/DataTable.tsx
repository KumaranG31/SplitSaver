'use client';

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useParsedDataStore } from '@/store/useParsedDataStore';
import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS, subtotalFor, summarizeItems } from '@/utils/optimizationEngine';

const BRAND: Record<Platform, string> = {
  Swiggy: 'text-swiggy',
  Zomato: 'text-zomato',
  Toing: 'text-toing',
};

/**
 * Editable order grid: one row per item, a quantity, and a price for every
 * platform.
 *
 * A cell left empty is not zero. It means no screenshot supplied that price, so
 * the engine borrows one from another platform and flags the resulting total as
 * an estimate. Empty cells are marked with a placeholder so a borrowed price is
 * never mistaken for a measured one.
 */
export const DataTable = () => {
  const { items, updateItem, updateItemPrice, addItem, removeItem } =
    useParsedDataStore();

  const totals = useMemo(() => summarizeItems(items), [items]);
  const subtotals = useMemo(
    () => PLATFORMS.map((platform) => subtotalFor(items, platform)),
    [items],
  );

  const toNumber = (value: string): number | undefined => {
    if (value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };

  return (
    <div className="glass overflow-x-auto rounded-xl p-4">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Order line items. Edit the quantity and the price for each platform.
        </caption>
        <thead className="border-b border-divider">
          <tr>
            <th scope="col" className="p-2 text-sm font-medium text-app-muted">Item</th>
            <th scope="col" className="p-2 text-sm font-medium text-app-muted">Qty</th>
            {PLATFORMS.map((platform) => (
              <th
                key={platform}
                scope="col"
                className={`p-2 text-sm font-medium ${BRAND[platform]}`}
              >
                {platform}
              </th>
            ))}
            <th scope="col" className="p-2 text-sm font-medium text-app-muted">Fee</th>
            <th scope="col" className="p-2 text-sm font-medium text-app-muted">Tax</th>
            <th scope="col" className="p-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-divider last:border-b-0">
              <td className="p-2">
                <input
                  aria-label={`Name for item ${item.id}`}
                  className="field"
                  value={item.name}
                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-label={`Quantity for item ${item.id}`}
                  className="field"
                  value={item.quantity}
                  onChange={(event) =>
                    updateItem(item.id, {
                      quantity: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                />
              </td>
              {PLATFORMS.map((platform) => {
                const known = typeof item.prices[platform] === 'number';
                return (
                  <td key={platform} className="p-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      aria-label={`${platform} price for item ${item.id}`}
                      className="field"
                      placeholder={known ? undefined : '—'}
                      value={item.prices[platform] ?? ''}
                      onChange={(event) =>
                        updateItemPrice(item.id, platform, toNumber(event.target.value))
                      }
                    />
                  </td>
                );
              })}
              <td className="p-2">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Platform fee for item ${item.id}`}
                  className="field"
                  placeholder="—"
                  value={item.platformFee ?? ''}
                  onChange={(event) =>
                    updateItem(item.id, { platformFee: toNumber(event.target.value) ?? 0 })
                  }
                />
              </td>
              <td className="p-2">
                <input
                  type="number"
                  inputMode="decimal"
                  aria-label={`Tax for item ${item.id}`}
                  className="field"
                  placeholder="—"
                  value={item.tax ?? ''}
                  onChange={(event) =>
                    updateItem(item.id, { tax: toNumber(event.target.value) ?? 0 })
                  }
                />
              </td>
              <td className="p-2 text-right">
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.name || 'item'}`}
                  className="btn btn-ghost-danger p-1"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-divider text-sm">
            <td className="p-2 font-medium">Subtotal</td>
            <td className="p-2" />
            {subtotals.map((value, index) => (
              <td key={PLATFORMS[index]} className="p-2 font-medium">
                &#8377;{value.toFixed(2)}
              </td>
            ))}
            <td className="p-2 font-medium">&#8377;{totals.itemFees.toFixed(2)}</td>
            <td className="p-2 font-medium">&#8377;{totals.tax.toFixed(2)}</td>
            <td className="p-2" />
          </tr>
        </tfoot>
      </table>

      <p className="mt-3 text-xs text-app-muted">
        An empty price cell means no screenshot supplied that price. That platform is
        costed using a price borrowed from another app and its total is marked as an
        estimate.
      </p>

      <button type="button" onClick={addItem} className="btn btn-secondary mt-4">
        <Plus size={16} /> Add row
      </button>
    </div>
  );
};
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

interface TradeDataItem {
  _id: string;
  normalizedGrade?: string | number | null;
  'Importer Name'?: string;
  'Consignor Name'?: string;
  'CASH DATE'?: string;
  cashDate?: string | Date | null;
  usaRateWithCurr?: string;
  'Quantity'?: string | number;
  // keep rest flexible — allow access to all DB fields in modal view
  [key: string]: any;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function DataPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<TradeDataItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState(searchParams.get('sortField') || 'CASH DATE');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');
  const [selectedItem, setSelectedItem] = useState<TradeDataItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [limit, setLimit] = useState(parseInt(searchParams.get('limit') || '10'));
  const [dataType, setDataType] = useState(searchParams.get('dataType') || 'all');
  const [period, setPeriod] = useState(searchParams.get('period') || '');
  const [periodOptions, setPeriodOptions] = useState<Array<{ key: string; label: string; totalCount: number; polymerCount: number; nonPolymerCount: number }>>([]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchPeriods = useCallback(async () => {
    const response = await fetch(`/api/trade-data/periods?dataType=${encodeURIComponent(dataType)}`);
    const result = await response.json();
    const periods: Array<{ key: string; label: string; totalCount: number; polymerCount: number; nonPolymerCount: number }> = Array.isArray(result.periods) ? result.periods : [];
    setPeriodOptions(periods);

    if (period && !periods.some((item) => item.key === period)) {
      setPeriod('');
      const params = new URLSearchParams(searchParams);
      params.delete('period');
      params.set('page', '1');
      router.push(`/data?${params}`);
    }
  }, [dataType, period, router, searchParams]);

  const fetchData = useCallback(async () => {
    if (status !== 'authenticated') return;

    setLoading(true);
    const params = new URLSearchParams(searchParams);
    params.set('dataType', dataType);
    if (period) {
      params.set('period', period);
    } else {
      params.delete('period');
    }

    const response = await fetch(`/api/trade-data?${params}`);
    const result = await response.json();
    setData(result.data ?? []);
    setPagination(result.pagination ?? null);
    setLoading(false);
  }, [dataType, period, searchParams, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  // Close modal on Escape key (hook placed here so hooks order is stable across renders)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status === 'loading' || loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (status === 'unauthenticated') {
    return <div className="min-h-screen flex items-center justify-center">Redirecting to login...</div>;
  }

  const performSearch = () => {
    const params = new URLSearchParams(searchParams);
    if (searchInput) {
      params.set('search', searchInput);
    } else {
      params.delete('search');
    }
    params.set('page', '1');
    params.set('dataType', dataType);
    if (period) params.set('period', period);
    router.push(`/data?${params}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch();
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    params.set('dataType', dataType);
    if (period) params.set('period', period);
    router.push(`/data?${params}`);
  };

  const handleSort = (field: string) => {
    const newOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortOrder(newOrder);
    const params = new URLSearchParams(searchParams);
    params.set('sortField', field);
    params.set('sortOrder', newOrder);
    params.set('page', '1');
    params.set('dataType', dataType);
    if (period) params.set('period', period);
    router.push(`/data?${params}`);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    const params = new URLSearchParams(searchParams);
    params.set('limit', newLimit.toString());
    params.set('page', '1');
    params.set('dataType', dataType);
    if (period) params.set('period', period);
    router.push(`/data?${params}`);
  };

  const handleRowClick = (item: TradeDataItem) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-6 gap-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                All Trade Data
              </h1>
              <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto justify-between sm:justify-end">
                <ThemeToggle />
                <Link
                  href="/dashboard"
                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <form onSubmit={handleSearch} className="mb-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      performSearch();
                    }
                  }}
                  placeholder="Search by HS CODE, Item Description, Importer, Consignor, Origin, Port..."
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm sm:text-base"
                />
                <div className="flex gap-2 sm:gap-4">
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium flex-1 sm:flex-none"
                  >
                    Search
                  </button>
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('');
                        const params = new URLSearchParams(searchParams);
                        params.delete('search');
                        params.set('page', '1');
                        router.push(`/data?${params}`);
                      }}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium flex-1 sm:flex-none"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                {(periodOptions.some((item) => item.polymerCount > 0) && periodOptions.some((item) => item.nonPolymerCount > 0)) && (
                  <select
                    value={dataType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setDataType(nextType);
                      const params = new URLSearchParams(searchParams);
                      params.set('dataType', nextType);
                      params.delete('period');
                      params.set('page', '1');
                      setPeriod('');
                      router.push(`/data?${params}`);
                    }}
                    className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                  >
                    <option value="all">All Data</option>
                    <option value="polymer">Polymers</option>
                    <option value="non-polymer">Non-Polymers</option>
                  </select>
                )}

                <select
                  value={period}
                  onChange={(e) => {
                    const nextPeriod = e.target.value;
                    setPeriod(nextPeriod);
                    const params = new URLSearchParams(searchParams);
                    if (nextPeriod) {
                      params.set('period', nextPeriod);
                    } else {
                      params.delete('period');
                    }
                    params.set('page', '1');
                    router.push(`/data?${params}`);
                  }}
                  className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="">All periods</option>
                  {periodOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} ({item.totalCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-md">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Grade NO.
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" onClick={() => handleSort('Importer Name')}>
                      Importer {sortField === 'Importer Name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" onClick={() => handleSort('Consignor Name')}>
                      Consignor {sortField === 'Consignor Name' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => handleSort('CASH DATE')}>
                      Cash Date {sortField === 'CASH DATE' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      USA RATE
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Qty
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider" onClick={() => handleSort('Item Description')}>
                      Item Description {sortField === 'Item Description' && (sortOrder === 'asc' ? ' ↑' : ' ↓')}
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      HS CODE
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Origin
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Port
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.map((item) => (
                    <tr key={item._id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => handleRowClick(item)}>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item.normalizedGrade ?? item['normalizedGrade'] ?? item['Grade'] ?? item['grade'] ?? ''}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="max-w-32 sm:max-w-none truncate">{item['Importer Name']}</div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="max-w-32 sm:max-w-none truncate">{item['Consignor Name']}</div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item.cashDate ? new Date(item.cashDate).toLocaleDateString() : (item['CASH DATE'] ?? '')}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item.usaRateWithCurr ?? (item['USA RATE'] ? `${item['USA RATE']}${item['Curr'] ? ' ' + item['Curr'] : ''}` : '')}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item['Quantity'] ?? item['Qty'] ?? ''}
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-sm text-gray-900 dark:text-white" title={item['Item Description']}>
                        <div className="max-w-32 sm:max-w-none truncate">
                          {item['Item Description']?.length > 50 ? `${item['Item Description'].substring(0, 50)}...` : item['Item Description']}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item['HS CODE']}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item['Origin']}
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {item['PORT']}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && (
            <div className="mt-6 bg-white dark:bg-gray-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-gray-200 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mb-4 sm:mb-0">
                <div className="flex items-center space-x-2">
                  <label htmlFor="limit-select" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Records per page:
                  </label>
                  <select
                    id="limit-select"
                    value={limit}
                    onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                    className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
                </div>
              </div>
              {pagination.pages > 1 && (
                <div className="flex items-center space-x-1 sm:space-x-2">
                  <button
                    onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                    disabled={pagination.page === 1}
                    className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="hidden sm:inline">Previous</span>
                    <span className="sm:hidden">←</span>
                  </button>
                  <div className="hidden sm:flex">
                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(pagination.pages - 4, pagination.page - 2)) + i;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-2 text-sm font-medium rounded-md ${
                            pageNum === pagination.page
                              ? 'text-white bg-indigo-600'
                              : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <div className="sm:hidden">
                    <span className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {pagination.page} / {pagination.pages}
                    </span>
                  </div>
                  <button
                    onClick={() => handlePageChange(Math.min(pagination.pages, pagination.page + 1))}
                    disabled={pagination.page === pagination.pages}
                    className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <span className="sm:hidden">→</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Trade Data Details</h3>
                </div>
                <div className="px-4 sm:px-6 py-4">
                  {selectedItem && (
                    <div className="space-y-3">
                      {Object.entries(selectedItem).map(([key, value]) => (
                        key !== '_id' && key !== '__v' && key !== 'createdAt' && key !== 'updatedAt' && (
                          <div key={key} className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                            <span className="font-medium text-gray-700 dark:text-gray-300 mb-1 sm:mb-0">{key}:</span>
                            <span className="text-gray-900 dark:text-white break-words">{String(value)}</span>
                          </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 w-full sm:w-auto"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

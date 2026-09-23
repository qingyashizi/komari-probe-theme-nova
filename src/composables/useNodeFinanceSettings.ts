import type { CurrencyCode, ExchangeRateSource } from '@/utils/financeHelper'
import { onMounted, ref } from 'vue'
import * as financeHelper from '@/utils/financeHelper'

/**
 * Owns the exchange-rate/currency/free-node-exclusion state shared by the
 * general summary cards and the finance details dialog: loads the daily
 * rates on mount, applies any locally stored overrides, and exposes the
 * update functions that persist a change back to local storage.
 */
export function useNodeFinanceSettings() {
  const exchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
  const dailyExchangeRates = ref(financeHelper.DEFAULT_EXCHANGE_RATES)
  const exchangeRateSource = ref<ExchangeRateSource | 'loading'>('loading')
  const exchangeRateUpdatedAt = ref<number | null>(null)
  const financeCurrency = ref<CurrencyCode>('CNY')
  const excludeFreeNodes = ref(true)

  function updateFinanceCurrency(currency: CurrencyCode) {
    financeCurrency.value = currency
    financeHelper.setStoredFinanceCurrency(currency)
  }

  function updateExcludeFreeNodes(exclude: boolean) {
    excludeFreeNodes.value = exclude
    financeHelper.setExcludeFreeNodes(exclude)
  }

  function updateExchangeRate(currency: CurrencyCode, value: number) {
    financeHelper.setExchangeRateOverride(currency, value)
    exchangeRates.value = { ...exchangeRates.value, [currency]: value, CNY: 1 }
  }

  function resetExchangeRates() {
    financeHelper.clearExchangeRateOverrides()
    exchangeRates.value = { ...dailyExchangeRates.value }
  }

  onMounted(async () => {
    financeCurrency.value = financeHelper.getStoredFinanceCurrency()
    excludeFreeNodes.value = financeHelper.shouldExcludeFreeNodes()

    const { rates, source, updatedAt } = await financeHelper.getDailyExchangeRates()
    dailyExchangeRates.value = rates
    exchangeRates.value = financeHelper.applyExchangeRateOverrides(rates)
    exchangeRateSource.value = source
    exchangeRateUpdatedAt.value = updatedAt
  })

  return {
    exchangeRates,
    dailyExchangeRates,
    exchangeRateSource,
    exchangeRateUpdatedAt,
    financeCurrency,
    excludeFreeNodes,
    updateFinanceCurrency,
    updateExcludeFreeNodes,
    updateExchangeRate,
    resetExchangeRates,
  }
}

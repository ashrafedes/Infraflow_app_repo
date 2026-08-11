import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Translation resources — bundled (no lazy loading needed for this app size)
import enCommon from '@/locales/en/common.json'
import enAuth from '@/locales/en/auth.json'
import enLayout from '@/locales/en/layout.json'
import enDashboard from '@/locales/en/dashboard.json'
import enWorkOrders from '@/locales/en/workOrders.json'
import enMovements from '@/locales/en/movements.json'
import enMaterials from '@/locales/en/materials.json'
import enMasterData from '@/locales/en/masterData.json'
import enReports from '@/locales/en/reports.json'
import enUsers from '@/locales/en/users.json'
import enSubscription from '@/locales/en/subscription.json'
import enSuperAdmin from '@/locales/en/superAdmin.json'

import arCommon from '@/locales/ar/common.json'
import arAuth from '@/locales/ar/auth.json'
import arLayout from '@/locales/ar/layout.json'
import arDashboard from '@/locales/ar/dashboard.json'
import arWorkOrders from '@/locales/ar/workOrders.json'
import arMovements from '@/locales/ar/movements.json'
import arMaterials from '@/locales/ar/materials.json'
import arMasterData from '@/locales/ar/masterData.json'
import arReports from '@/locales/ar/reports.json'
import arUsers from '@/locales/ar/users.json'
import arSubscription from '@/locales/ar/subscription.json'
import arSuperAdmin from '@/locales/ar/superAdmin.json'

export const LANGUAGES = ['en', 'ar'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        layout: enLayout,
        dashboard: enDashboard,
        workOrders: enWorkOrders,
        movements: enMovements,
        materials: enMaterials,
        masterData: enMasterData,
        reports: enReports,
        users: enUsers,
        subscription: enSubscription,
        superAdmin: enSuperAdmin,
      },
      ar: {
        common: arCommon,
        auth: arAuth,
        layout: arLayout,
        dashboard: arDashboard,
        workOrders: arWorkOrders,
        movements: arMovements,
        materials: arMaterials,
        masterData: arMasterData,
        reports: arReports,
        users: arUsers,
        subscription: arSubscription,
        superAdmin: arSuperAdmin,
      },
    },
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'infraflow-lang',
      caches: ['localStorage'],
    },
  })

export default i18n

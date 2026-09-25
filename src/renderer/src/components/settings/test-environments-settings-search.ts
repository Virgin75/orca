import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'

export const getTestEnvironmentsSettingsSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.testEnvironments.searchTitle', 'Test environments'),
    description: translate(
      'auto.components.settings.testEnvironments.searchDescription',
      'Create, edit and delete multi-repo test environments with generated ports and setup scripts.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.testEnvironments.keywordTest', 'test'),
      ...translateSearchKeyword(
        'auto.components.settings.testEnvironments.keywordEnvironment',
        'environment'
      ),
      ...translateSearchKeyword('auto.components.settings.testEnvironments.keywordPorts', 'ports'),
      ...translateSearchKeyword('auto.components.settings.testEnvironments.keywordSetup', 'setup'),
      ...translateSearchKeyword('auto.components.settings.testEnvironments.keywordStack', 'stack')
    ]
  }
])

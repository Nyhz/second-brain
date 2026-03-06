import { AssetsFeature } from '../../components/features/assets/assets-feature';
import { loadAssetsData } from '../../lib/data/assets-data';

export default async function AssetsPage() {
  const assetsData = await loadAssetsData({ withHoldings: true }).catch(() => ({
    rows: [],
    holdingsByAssetId: {},
  }));
  return (
    <AssetsFeature
      initialRows={assetsData.rows}
      initialHoldingsByAssetId={assetsData.holdingsByAssetId}
    />
  );
}

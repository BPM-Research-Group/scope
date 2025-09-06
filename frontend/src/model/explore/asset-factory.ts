export class AssetFactory {
    static createAsset<BaseExploreNodeAsset>(params: Omit<BaseExploreNodeAsset, 'id'>) {
        return {
            ...params,
            id: 'unique',
        };
    }
}

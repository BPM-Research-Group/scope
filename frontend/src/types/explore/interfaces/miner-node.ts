import type { QueryConfig } from '~/services/nodeQueryConfig';
import type {
    BaseExploreNodeConfig,
    BaseExploreNodeData,
    BaseExploreNodeDisplay,
} from '~/types/explore/interfaces/base-node';

export interface MinerExploreNodeDisplay extends BaseExploreNodeDisplay {}

export interface MinerExploreNodeConfig extends BaseExploreNodeConfig {}

export interface MinerExploreNodeData extends BaseExploreNodeData {
    config: MinerExploreNodeConfig;
    display: MinerExploreNodeDisplay;
    queryConfig: QueryConfig;
    minedData: any;
}

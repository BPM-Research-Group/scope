import { GATEWAY_NODE, START_END_EVENT_NODE } from '~/consts/flow/lbofConstants';
import { gatewayOperators, type InterOperator } from '~/types/flow/altFlow.types';

export class OperatorNodeSize {
    static getNodeSize(operator: InterOperator) {
        if (gatewayOperators.includes(operator as any)) return GATEWAY_NODE;
        else if (operator === 'startEvent' || operator == 'endEvent') return START_END_EVENT_NODE;
        // Default will also just take the start end event size
        else return START_END_EVENT_NODE;
    }
}

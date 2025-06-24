import { type HierarchyPointLinkObjectCentric, type TreeNode } from '~/types/ocpt/ocpt.types';
import { LinkLine } from '~/components/ocpt/ocptLink.utils';

interface OcptLinkProps {
    link: HierarchyPointLinkObjectCentric<TreeNode>;
    linkId: number;
}

const OcptLink: React.FC<OcptLinkProps> = ({ link, linkId }) => {
    return <LinkLine key={`${linkId}`} data={link} strokeWidth="1" className={`stroke-gray-300`} />;
};

export default OcptLink;

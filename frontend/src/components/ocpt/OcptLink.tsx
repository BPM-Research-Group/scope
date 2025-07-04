import getLinkComponent from '~/components/ocpt/getLinkComponent';
import { type HierarchyPointLinkObjectCentric, type TreeNode } from '~/types/ocpt/ocpt.types';

const LinkLine = getLinkComponent({
    layout: 'cartesian',
    linkType: 'line',
    orientation: 'vertical',
});

interface OcptLinkProps {
    link: HierarchyPointLinkObjectCentric<TreeNode>;
    linkId: number;
}

const OcptLink: React.FC<OcptLinkProps> = ({ link, linkId }) => {
    return <LinkLine key={`${linkId}`} data={link} strokeWidth="1" className={`stroke-gray-300`} />;
};

export default OcptLink;

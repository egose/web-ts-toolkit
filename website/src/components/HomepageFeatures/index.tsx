import clsx from 'clsx';
import Heading from '@theme/Heading';
import CommunicationSvg from '@site/static/img/communication.svg';
import PortfolioSvg from '@site/static/img/portfolio.svg';
import SecuritySvg from '@site/static/img/security.svg';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'API Boundary Toolkit',
    Svg: SecuritySvg,
    description: <>Build Express APIs with consistent routing, response handling, and structured HTTP errors.</>,
  },
  {
    title: 'Typed Mongoose Helpers',
    Svg: CommunicationSvg,
    description: <>Use access-aware routers and reusable Mongoose helpers for common backend patterns.</>,
  },
  {
    title: 'Workspace-Centered Docs',
    Svg: PortfolioSvg,
    description: (
      <>Keep detailed package documentation in one Docusaurus site while leaving concise package READMEs locally.</>
    ),
  },
];

function Feature({ title, Svg, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

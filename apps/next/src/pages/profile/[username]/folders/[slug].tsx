import dynamic from "next/dynamic";

import { HeadSeo } from "@studyapp/components/head-seo";

import { LazyWrapper } from "../../../../common/lazy-wrapper";
import { PageWrapper } from "../../../../common/page-wrapper";
import { getLayout } from "../../../../layouts/main-layout";
import type { inferSSRProps } from "../../../../lib/infer-ssr-props";

const Folder404 = dynamic(
  () => import("../../../../modules/folders/folder-404"),
  {
    ssr: false,
  },
);
const InternalFolder = dynamic(
  () => import("../../../../components/internal-folder"),
);

export const runtime = "experimental-edge";

const FolderPage = ({ folder }: inferSSRProps<typeof getServerSideProps>) => {
  if (!folder) return <Folder404 />;

  return (
    <>
      <HeadSeo
        title={folder.title}
        description={folder.description}
        entity={{
          type: "Folder",
          title: folder.title,
          description: folder.description,
          numItems: folder.studySets,
          user: {
            username: folder.user.username!,
            image: folder.user.image || "",
          },
        }}
      />
      <LazyWrapper>
        <InternalFolder />
      </LazyWrapper>
    </>
  );
};

FolderPage.PageWrapper = PageWrapper;
FolderPage.getLayout = getLayout;

// The Drizzle/edge SSR layer this page used was removed: it was gated behind a
// PLANETSCALE flag that was never set, so this branch is the only one that has
// ever run. getServerSideProps is kept so the route stays server-rendered
// rather than becoming a static page that would demand getStaticPaths.
interface FolderSeoProps {
  title: string;
  description: string;
  studySets: number;
  // Nullable to match the columns, which is why the render site coerces.
  user: { username: string | null; image: string | null };
}

export const getServerSideProps = (): Promise<{
  props: { folder: FolderSeoProps | null };
}> => Promise.resolve({ props: { folder: null } });

export default FolderPage;

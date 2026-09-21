import dynamic from "next/dynamic";

import { HeadSeo } from "@studyapp/components/head-seo";
import type { EntityImageProps } from "@studyapp/lib/seo";

import { LazyWrapper } from "../../common/lazy-wrapper";
import { PageWrapper } from "../../common/page-wrapper";
import { getLayout } from "../../layouts/main-layout";
import type { inferSSRProps } from "../../lib/infer-ssr-props";

export const runtime = "experimental-edge";

const InternalSet = dynamic(() => import("../../components/internal-set"));

const Set = ({ set, collab }: inferSSRProps<typeof getServerSideProps>) => {
  return (
    <>
      {set && (
        <HeadSeo
          title={set?.title ?? "Not found"}
          description={set?.description ?? undefined}
          entity={{
            type: "StudySet",
            title: set.title,
            description: set.description,
            numItems: set.terms,
            collaborators: set.collaborators ?? undefined,
            user: {
              username: set.user.username!,
              image: set.user.image || "",
            },
          }}
          nextSeoProps={{
            noindex: set.visibility != "Public",
            nofollow: set.visibility != "Public",
          }}
        />
      )}
      <LazyWrapper>
        <InternalSet collab={collab} />
      </LazyWrapper>
    </>
  );
};

// The Drizzle/edge SSR layer this page used was removed: it was gated behind a
// PLANETSCALE flag that was never set, so this branch is the only one that has
// ever run. getServerSideProps is kept so the route stays server-rendered
// rather than becoming a static page that would demand getStaticPaths.
interface SetSeoProps {
  title: string;
  description: string;
  visibility: string;
  terms: number;
  collaborators: EntityImageProps["collaborators"] | null;
  user: { username: string | null; image: string | null };
}

export const getServerSideProps = (): Promise<{
  props: { set: SetSeoProps | null; collab: boolean };
}> => Promise.resolve({ props: { set: null, collab: false } });

Set.PageWrapper = PageWrapper;
Set.getLayout = getLayout;

export default Set;

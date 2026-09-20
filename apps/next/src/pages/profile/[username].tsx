import dynamic from "next/dynamic";

import { HeadSeo } from "@studyapp/components/head-seo";
import type { ProfileImageProps } from "@studyapp/lib/seo";

import { LazyWrapper } from "../../common/lazy-wrapper";
import { PageWrapper } from "../../common/page-wrapper";
import { getLayout } from "../../layouts/main-layout";
import type { inferSSRProps } from "../../lib/infer-ssr-props";

const InternalProfile = dynamic(
  () => import("../../components/internal-profile"),
);

export const runtime = "experimental-edge";

const UserPage = ({ user }: inferSSRProps<typeof getServerSideProps>) => {
  return (
    <>
      {user && <HeadSeo title={user.name ?? user.username} profile={user} />}
      <LazyWrapper>
        <InternalProfile />
      </LazyWrapper>
    </>
  );
};

// The Drizzle/edge SSR layer this page used was removed: it was gated behind a
// PLANETSCALE flag that was never set, so this branch is the only one that has
// ever run. getServerSideProps is kept so the route stays server-rendered
// rather than becoming a static page that would demand getStaticPaths.
export const getServerSideProps = (): Promise<{
  props: { user: ProfileImageProps | null };
}> => Promise.resolve({ props: { user: null } });

UserPage.PageWrapper = PageWrapper;
UserPage.getLayout = getLayout;

export default UserPage;

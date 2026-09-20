import { functions, inngest } from "@studyapp/inngest";
import { serve } from "@studyapp/inngest/next";

export default serve({ client: inngest, functions });

import { FlowStudio } from "@/components/flow/flow-studio"
import { listFlows, getFlow } from "@/app/actions/flows"

export const dynamic = "force-dynamic"

export default async function Page() {
  const flows = await listFlows()
  const initialFlow = await getFlow(flows[0].id)

  return <FlowStudio initialFlows={flows} initialFlow={initialFlow} />
}

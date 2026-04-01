import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Environment and platform setup"
        description="This screen captures the human steps that still need real credentials or dashboard configuration after the scaffold is finished."
      />
      <Tabs className="space-y-4" defaultValue="auth">
        <TabsList>
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
        </TabsList>
        <TabsContent value="auth">
          <Card>
            <CardHeader>
              <CardTitle>Supabase Auth placeholders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Set the Supabase Site URL to your local web app origin, usually
                http://localhost:3000.
              </p>
              <p>Add a redirect URL for http://localhost:3000/auth/callback.</p>
              <p>Create the internal staff test accounts you want to use for development.</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle>Storage buckets to create</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Create private buckets named uploads, reports, participant-cards, and optional
                assets.
              </p>
              <p>
                Apply signed URL or service-role access rules later based on your final upload
                workflow.
              </p>
              <p>
                The backend storage helper is ready to use once those bucket names and credentials
                exist.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="database">
          <Card>
            <CardHeader>
              <CardTitle>Database connection placeholder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                Paste your Supabase Postgres connection string into DATABASE_URL and DIRECT_URL.
              </p>
              <p>Run Prisma generate, migrate, and seed after the hosted database is reachable.</p>
              <p>The initial schema and seed script are already scaffolded in apps/api/prisma.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}

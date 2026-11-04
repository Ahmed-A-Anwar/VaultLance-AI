/**
 * seed-test-vaults.cjs
 * Seeds full end-to-end example data in Supabase for user owm.tech.ai@gmail.com
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('Seeding Supabase test examples...');

  // 1. Get client user id for owm.tech.ai@gmail.com
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('email', 'owm.tech.ai@gmail.com')
    .single();

  if (uErr || !user) {
    console.error('User owm.tech.ai@gmail.com not found in public.users:', uErr);
    process.exit(1);
  }

  const clientId = user.id;
  console.log(`Found client user: ${user.full_name} (${clientId})`);

  // 2. Ensure a freelancer user exists for realistic multi-user display
  let freelancerId = '11111111-2222-3333-4444-555555555555';
  const { data: fl } = await supabase.from('users').select('id').eq('email', 'maya.freelancer@vaultlance.demo').single();
  if (fl) {
    freelancerId = fl.id;
  } else {
    await supabase.from('users').upsert({
      id: freelancerId,
      email: 'maya.freelancer@vaultlance.demo',
      password_hash: '$2b$10$wN1r7.4pA3VqH7qLp1UGe.8zB31nKk4c2ZpB0z3uL9Zg.3M8L0w8e',
      full_name: 'Maya Lin',
      role: 'FREELANCER',
      account_status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // 3. Define 4 test vaults representing each state in the platform lifecycle
  const testVaults = [
    {
      id: '8f3b0200-4e00-4000-8000-000000000001',
      title: 'Booking Web App',
      description: 'Next.js 14 booking system with PostgreSQL database and Stripe integration',
      amount: 2400.00,
      currency: 'USD',
      status: 'AWAITING_APPROVAL', // Audited, ready for "Hold to approve & pay"
      freelancer_id: freelancerId,
    },
    {
      id: '8f3b0200-4e00-4000-8000-000000000002',
      title: 'Mobile App Redesign',
      description: 'iOS & Android Figma tokens, component library and high-fidelity prototype',
      amount: 1200.00,
      currency: 'USD',
      status: 'AWAITING_AUTHORIZATION', // Ready for PayPal live payment button!
      freelancer_id: freelancerId,
    },
    {
      id: '8f3b0200-4e00-4000-8000-000000000003',
      title: 'Logo & Brand Identity Pack',
      description: 'Vector logo marks, brand guidelines PDF, typography hierarchy & color swatches',
      amount: 350.00,
      currency: 'USD',
      status: 'AUTHORIZED', // Funds held, ready for "Audit now ->"
      freelancer_id: freelancerId,
    },
    {
      id: '8f3b0200-4e00-4000-8000-000000000004',
      title: 'Landing Page Copy & SEO',
      description: 'High-conversion SaaS landing page copy, meta tags, and structured schema markup',
      amount: 450.00,
      currency: 'USD',
      status: 'PAID', // Unlocked with download ready
      freelancer_id: freelancerId,
    },
  ];

  for (const v of testVaults) {
    const { error: vErr } = await supabase.from('vaults').upsert({
      id: v.id,
      freelancer_id: v.freelancer_id,
      title: v.title,
      description: v.description,
      amount: v.amount,
      currency: v.currency,
      status: v.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (vErr) {
      console.error(`Error inserting vault ${v.title}:`, vErr);
    } else {
      console.log(`✓ Vault upserted: ${v.title} [${v.status}]`);
    }

    // Vault membership for Client
    await supabase.from('vault_members').upsert({
      id: `member-${v.id.slice(-6)}-client`,
      vault_id: v.id,
      user_id: clientId,
      role: 'CLIENT',
      invitation_status: 'ACCEPTED',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Vault membership for Freelancer
    await supabase.from('vault_members').upsert({
      id: `member-${v.id.slice(-6)}-fl`,
      vault_id: v.id,
      user_id: freelancerId,
      role: 'FREELANCER',
      invitation_status: 'ACCEPTED',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }

  // 4. Seed Ledger Events for realistic history
  const ledgerEvents = [
    {
      id: '99990001-0000-0000-0000-000000000001',
      vault_id: '8f3b0200-4e00-4000-8000-000000000004',
      actor_id: clientId,
      event_type: 'PAYMENT_CAPTURED',
      amount: 450,
      currency: 'USD',
      metadata: { note: 'Capture completed, funds moved to Maya' },
      created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    },
    {
      id: '99990001-0000-0000-0000-000000000002',
      vault_id: '8f3b0200-4e00-4000-8000-000000000004',
      actor_id: clientId,
      event_type: 'MILESTONE_APPROVED',
      amount: null,
      currency: 'USD',
      metadata: { note: 'Delivery unlocked to the freelancer' },
      created_at: new Date(Date.now() - 3600000 * 2 - 1000).toISOString(),
    },
    {
      id: '99990001-0000-0000-0000-000000000003',
      vault_id: '8f3b0200-4e00-4000-8000-000000000001',
      actor_id: clientId,
      event_type: 'FUNDS_AUTHORIZED',
      amount: 2400,
      currency: 'USD',
      metadata: { note: 'Funds authorized via PayPal Sandbox, held in escrow' },
      created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    },
    {
      id: '99990001-0000-0000-0000-000000000004',
      vault_id: '8f3b0200-4e00-4000-8000-000000000003',
      actor_id: clientId,
      event_type: 'FUNDS_AUTHORIZED',
      amount: 350,
      currency: 'USD',
      metadata: { note: 'Funds authorized, held in escrow' },
      created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    },
  ];

  for (const ev of ledgerEvents) {
    await supabase.from('ledger_events').upsert(ev);
  }
  console.log(`✓ Seeded ${ledgerEvents.length} ledger events into Supabase`);

  // 5. Seed deliverable files into vault_files for testing downloads
  const files = [
    {
      id: 'file-00000001-0001-0001-0001-000000000001',
      vault_id: '8f3b0200-4e00-4000-8000-000000000004',
      uploaded_by: freelancerId,
      file_name: 'landing-page-copy.pdf',
      storage_path: 'vault-demo-landing-copy.pdf',
      mime_type: 'application/pdf',
      file_size: 245000,
      sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      created_at: new Date().toISOString(),
    },
    {
      id: 'file-00000001-0001-0001-0001-000000000002',
      vault_id: '8f3b0200-4e00-4000-8000-000000000001',
      uploaded_by: freelancerId,
      file_name: 'booking-app-source.zip',
      storage_path: 'vault-demo-booking-app.zip',
      mime_type: 'application/zip',
      file_size: 4890000,
      sha256_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      created_at: new Date().toISOString(),
    },
  ];

  for (const f of files) {
    await supabase.from('vault_files').upsert(f);
  }
  console.log(`✓ Seeded ${files.length} vault files into Supabase`);
  console.log('\nAll test data ready in Supabase!');
}

seed().catch(console.error);

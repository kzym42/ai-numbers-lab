const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const email = customer.email;
      if (email) {
        await supabase.from('premium_users').upsert({
          email: email,
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          status: subscription.status === 'active' ? 'active' : 'inactive',
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customer = await stripe.customers.retrieve(subscription.customer);
      const email = customer.email;
      if (email) {
        await supabase.from('premium_users')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('email', email);
      }
    }

    return res.status(200).json({ received: true });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
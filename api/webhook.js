const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    if (event.type === 'customer.subscription.created' ||
        event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.retrieve(customerId);
      const email = customer.email;

      if (email) {
        await supabase.from('premium_users').upsert({
          email: email,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          status: status === 'active' ? 'active' : 'inactive',
          updated_at: new Date().toISOString()
        }, { onConflict: 'email' });
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.retrieve(customerId);
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

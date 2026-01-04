/* 2FLY Internal Wholesale System (Static)
   - Supabase Auth (email+password)
   - Orders board + View button -> Order Details page
   - New Order (4 types) + Discount (₱) for all
   - Staff can edit discount/status ONLY for orders they created
   - Owner/Admin sees Dashboard + Products/Inventory/Expenses/Receivables/Payables
*/
(function(){
  const $main = document.getElementById('main');
  const $top = document.getElementById('top-actions');

  const fmtPeso = (n) => {
    const x = Number(n || 0);
    return x.toLocaleString('en-PH', { style:'currency', currency:'PHP' });
  };

  const escapeHtml = (s) => (s ?? '').toString()
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'","&#039;");

  const qs = () => new URLSearchParams((location.hash.split('?')[1]||''));
  const route = () => (location.hash.split('?')[0] || '#/');

  function setTop(html){ $top.innerHTML = html || ''; }
  function render(html){ $main.innerHTML = html; }

  function toast(msg, kind='notice'){
    const el = document.createElement('div');
    el.className = kind === 'error' ? 'error' : 'notice';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.maxWidth = '420px';
    el.style.zIndex = 9999;
    el.innerHTML = `<div style="font-weight:800;margin-bottom:6px">${kind==='error'?'Error':'Notice'}</div><div class="small">${escapeHtml(msg)}</div>`;
    document.body.appendChild(el);
    setTimeout(()=>{ el.remove(); }, 4200);
  }

  async function importSupabase(){
    // Dynamic import reduces blank-screen risk and gives a clearer error.
    try{
      return await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    }catch(e){
      throw new Error('Failed to load Supabase library. Check internet/CDN or try hard refresh.');
    }
  }

  function getConfig(){
    const cfg = (window.APP_CONFIG || {});
    const url = cfg.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY;
    if(!url || !key || url.includes('PUT_SUPABASE') || key.includes('PUT_SUPABASE')){
      return null;
    }
    return { url, key };
  }

  let supabase = null;
  let session = null;
  let profile = null; // {role, display_name, commission_rate}
  let productsCache = null;

  async function init(){
    const cfg = getConfig();
    if(!cfg){
      render(`
        <div class="card">
          <div class="h1">Setup required</div>
          <div class="muted">Edit <code>config.js</code> and set your Supabase URL + Anon Key, then redeploy / refresh.</div>
          <div class="hr"></div>
          <div class="small muted">If you updated <code>config.js</code> but nothing changes, hard refresh (Ctrl+Shift+R).</div>
        </div>
      `);
      setTop('');
      return;
    }

    const mod = await importSupabase();
    supabase = mod.createClient(cfg.url, cfg.key);

    // Load session
    const { data } = await supabase.auth.getSession();
    session = data.session || null;

    supabase.auth.onAuthStateChange((_evt, s) => {
      session = s || null;
      profile = null;
      productsCache = null;
      reroute();
    });

    window.addEventListener('hashchange', reroute);
    reroute();
  }

  async function loadProfile(){
    if(!session) return null;
    if(profile) return profile;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, commission_rate')
      .eq('id', session.user.id)
      .maybeSingle();

    if(error){
      throw new Error(error.message || 'Failed to load profile');
    }
    if(!data){
      // Profile trigger might not have fired yet.
      profile = { role:'staff', display_name: session.user.email?.split('@')[0] || 'staff', commission_rate: 0.30 };
      return profile;
    }
    profile = data;
    return profile;
  }

  function navFor(role){
    const isOwner = (role === 'owner' || role === 'admin');
    const base = [
      ['Orders', '#/orders'],
      ['New Order', '#/new'],
      ['My Commission', '#/my-commission'],
    ];
    const owner = [
      ['Dashboard', '#/dashboard'],
      ['Products', '#/products'],
      ['Inventory', '#/inventory'],
      ['Expenses', '#/expenses'],
      ['Receivables', '#/receivables'],
      ['Payables', '#/payables'],
    ];
    return isOwner ? base.concat(owner) : base;
  }

  function renderTopbar(){
    if(!session){
      setTop(`<a class="btn" href="#/login">Login</a>`);
      return;
    }
    const role = profile?.role || 'staff';
    const pills = `<span class="pill ${role==='owner'||role==='admin'?'good':'warn'}">${escapeHtml(role.toUpperCase())}</span>`;
    const links = navFor(role).map(([t,h]) => `<a class="btn" href="${h}">${escapeHtml(t)}</a>`).join('');
    setTop(`
      ${pills}
      <span class="muted small">${escapeHtml(profile?.display_name || session.user.email || '')}</span>
      ${links}
      <button class="btn danger" id="btnLogout">Logout</button>
    `);
    const btn = document.getElementById('btnLogout');
    if(btn){
      btn.onclick = async () => { await supabase.auth.signOut(); };
    }
  }

  function requireAuth(){
    if(!session){
      location.hash = '#/login';
      return false;
    }
    return true;
  }

  function requireOwner(){
    const role = profile?.role || 'staff';
    if(role !== 'owner' && role !== 'admin'){
      render(`<div class="card"><div class="h1">Owner/Admin only</div><div class="muted">You don’t have access to this page.</div></div>`);
      return false;
    }
    return true;
  }

  async function reroute(){
    try{
      if(session){
        await loadProfile();
      }
      renderTopbar();

      const r = route();
      if(r === '#/' || r === '#'){
        location.hash = session ? '#/orders' : '#/login';
        return;
      }
      if(r === '#/login') return renderLogin();
      if(r === '#/orders') return renderOrders();
      if(r === '#/new') return renderNewOrder();
      if(r === '#/order') return renderOrderDetails();
      if(r === '#/my-commission') return renderMyCommission();
      if(r === '#/dashboard') return renderDashboard();
      if(r === '#/products') return renderProducts();
      if(r === '#/inventory') return renderInventory();
      if(r === '#/expenses') return renderExpenses();
      if(r === '#/receivables') return renderReceivables();
      if(r === '#/payables') return renderPayables();

      render(`<div class="card"><div class="h1">Not found</div><div class="muted">Unknown route.</div></div>`);
    }catch(err){
      render(`
        <div class="card error">
          <div class="h1">Something crashed</div>
          <div class="small">${escapeHtml(err?.message || String(err))}</div>
          <div class="hr"></div>
          <div class="muted">Common causes: wrong Supabase URL/Anon Key, schema not loaded (run SQL + reload), or RLS blocking.</div>
        </div>
      `);
      console.error(err);
    }
  }

  function renderLogin(){
    setTop('');
    render(`
      <div class="card">
        <div class="h1">Login</div>
        <div class="muted">Admins & staff only. Use your Supabase Auth email/password.</div>
        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="label">Email</div>
            <input id="email" class="input" placeholder="you@email.com" />
          </div>
          <div>
            <div class="label">Password</div>
            <input id="pass" class="input" type="password" placeholder="••••••••" />
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="btnLogin">Login</button>
          <button class="btn" id="btnSignup">Sign up</button>
          <span class="muted small">After signup, set your role to <b>owner</b> in <code>profiles</code> table (for your account).</span>
        </div>

        <div class="hr"></div>
        <div class="muted small">
          If the page goes blank after deploy, add the <code>_headers</code> file in this zip and redeploy (prevents stale JS cache).
        </div>
      </div>
    `);

    document.getElementById('btnLogin').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) toast(error.message, 'error');
    };

    document.getElementById('btnSignup').onclick = async () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pass').value;
      const { error } = await supabase.auth.signUp({ email, password });
      if(error) toast(error.message, 'error');
      else toast('Signup successful. Now login. Then set your role to owner/admin in profiles if needed.');
    };
  }

  async function ensureProducts(){
    if(productsCache) return productsCache;
    const { data, error } = await supabase
      .from('inventory_view')
      .select('sku, name, category, qty_on_hand')
      .order('category', { ascending:true })
      .order('sku', { ascending:true });
    if(error) throw new Error(error.message);
    productsCache = data || [];
    return productsCache;
  }

  function statusPill(status){
    const s = (status||'').toLowerCase();
    if(s === 'completed') return `<span class="pill good">COMPLETED</span>`;
    if(s === 'cancelled') return `<span class="pill bad">CANCELLED</span>`;
    if(s === 'shipped') return `<span class="pill warn">SHIPPED</span>`;
    return `<span class="pill">${escapeHtml(s.toUpperCase()||'PENDING')}</span>`;
  }

  // -----------------
  // Orders
  // -----------------
  async function renderOrders(){
    if(!requireAuth()) return;
    const role = profile.role;

    const { data, error } = await supabase
      .from('orders_board')
      .select('*')
      .order('created_at', { ascending:false })
      .limit(200);

    if(error) throw new Error(error.message);

    const rows = (data||[]).map(o => {
      const canEditDiscount = (role === 'owner' || role === 'admin' || o.created_by_id === session.user.id);
      return `
        <tr data-oid="${escapeHtml(o.id)}" data-ocode="${escapeHtml(o.order_code)}">
          <td>
            <div style="font-weight:900">
              <a class="btn" style="padding:6px 10px" href="#/order?id=${encodeURIComponent(o.order_code)}">View</a>
              <span style="margin-left:8px">${escapeHtml(o.order_code)}</span>
            </div>
            <div class="muted small">${new Date(o.created_at).toLocaleString()}</div>
          </td>
          <td>
            ${statusPill(o.status)}
            <div style="margin-top:8px">
              <select class="input statusSel" data-oid="${escapeHtml(o.id)}" style="padding:8px 10px">
                ${['pending','paid','packed','shipped','completed','cancelled'].map(s => `<option value="${s}" ${String(o.status).toLowerCase()===s?'selected':''}>${s}</option>`).join('')}
              </select>
              <div class="muted small" style="margin-top:6px">Type: <b>${escapeHtml((o.order_type||'').toUpperCase())}</b></div>
            </div>
          </td>
          <td>
            <div style="font-weight:800">${escapeHtml(o.customer_name||'')}</div>
            ${o.profile_link ? `<div class="small"><a class="btn" style="padding:6px 10px" target="_blank" rel="noopener" href="${escapeHtml(o.profile_link)}">FB</a></div>` : `<div class="muted small">FB link: —</div>`}
            <div class="muted small">Phone: ${escapeHtml(o.phone_number||'—')}</div>
          </td>
          <td>
            <div class="muted small">Region: <b>${escapeHtml(o.region||'—')}</b></div>
            <div class="muted small">Shipping paid: <b>${fmtPeso(o.shipping_paid)}</b></div>
            <div class="muted small">Discount: <b>${fmtPeso(o.discount_amount)}</b></div>
            <div class="muted small">By: <b>${escapeHtml(o.created_by_name||'')}</b></div>
          </td>
          <td>
            <div class="label">Discount (₱)</div>
            <input class="input discInp" data-oid="${escapeHtml(o.id)}" type="number" min="0" step="1" value="${Number(o.discount_amount||0)}" ${canEditDiscount?'':'disabled'} />
            <div class="label">Reason (required if >0)</div>
            <input class="input discReason" data-oid="${escapeHtml(o.id)}" value="${escapeHtml(o.discount_reason||'')}" ${canEditDiscount?'':'disabled'} />
            <div class="row" style="margin-top:10px">
              <button class="btn primary saveBtn" data-oid="${escapeHtml(o.id)}">Save</button>
            </div>
            <div class="muted small" style="margin-top:8px">
              Staff can edit discount only on their own orders.
            </div>
          </td>
        </tr>
      `;
    }).join('');

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">Orders</div>
            <div class="muted">All orders are visible to staff for tracking. Click <b>View</b> to see exact items.</div>
          </div>
          <a class="btn primary" href="#/new">+ New Order</a>
        </div>
        <div class="hr"></div>
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>ORDER</th>
                <th>STATUS / TYPE</th>
                <th>CUSTOMER</th>
                <th>SHIP / META</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody id="ordersBody">${rows || ''}</tbody>
          </table>
        </div>
        <div class="muted small" style="margin-top:10px">Showing latest 200 orders.</div>
      </div>
    `);

    document.querySelectorAll('.saveBtn').forEach(btn=>{
      btn.onclick = async () => {
        const oid = btn.dataset.oid;
        const status = document.querySelector(`.statusSel[data-oid="${CSS.escape(oid)}"]`)?.value;
        const disc = Number(document.querySelector(`.discInp[data-oid="${CSS.escape(oid)}"]`)?.value || 0);
        const reason = (document.querySelector(`.discReason[data-oid="${CSS.escape(oid)}"]`)?.value || '').trim();

        const { error } = await supabase.rpc('staff_update_order', {
          p_order_id: oid,
          p_status: status,
          p_discount_amount: disc,
          p_discount_reason: reason
        });
        if(error) toast(error.message, 'error');
        else { toast('Saved.'); reroute(); }
      };
    });
  }

  // -----------------
  // New Order
  // -----------------
  function itemRowTemplate(p, qty=1){
    const stock = (p.qty_on_hand ?? 0);
    return `
      <tr data-sku="${escapeHtml(p.sku)}">
        <td><b>${escapeHtml(p.sku)}</b><div class="muted small">${escapeHtml(p.category)}</div></td>
        <td>${escapeHtml(p.name)}</td>
        <td><span class="pill ${stock<=0?'bad':stock<5?'warn':'good'}">${stock}</span></td>
        <td><input class="input qty" type="number" min="1" step="1" value="${qty}" style="padding:8px 10px" /></td>
        <td><button class="btn danger rm">Remove</button></td>
      </tr>
    `;
  }

  async function renderNewOrder(){
    if(!requireAuth()) return;
    await ensureProducts();

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">New Order</div>
            <div class="muted">Supports 4 order types. Discount is order-level (₱) and applies to items only.</div>
          </div>
          <a class="btn" href="#/orders">Back to Orders</a>
        </div>
        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="label">Order Type</div>
            <select id="orderType" class="input">
              <option value="online">Online (has shipping + commission)</option>
              <option value="lalamove">Lalamove (no shipping)</option>
              <option value="walkin">Walk-in (no shipping, phone required)</option>
              <option value="tiktok">TikTok (retail tracking, no shipping)</option>
            </select>
          </div>
          <div id="regionWrap">
            <div class="label">Region (Online only)</div>
            <select id="region" class="input">
              <option value="luzon">Luzon</option>
              <option value="visayas">Visayas</option>
              <option value="mindanao">Mindanao</option>
            </select>
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:10px">
          <div id="shipWrap">
            <div class="label">Shipping Paid by customer (₱) (Online only)</div>
            <input id="shippingPaid" class="input" type="number" min="0" step="1" value="0" />
          </div>
          <div>
            <div class="label">Discount (₱) (All order types)</div>
            <input id="discount" class="input" type="number" min="0" step="1" value="0" />
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:10px">
          <div>
            <div class="label">Customer name (required)</div>
            <input id="customerName" class="input" placeholder="Customer Name" />
          </div>
          <div>
            <div class="label">Facebook profile link</div>
            <input id="fbLink" class="input" placeholder="https://facebook.com/..." />
          </div>
        </div>

        <div class="grid cols-2" style="margin-top:10px">
          <div>
            <div class="label">Phone number (required for Walk-in)</div>
            <input id="phone" class="input" placeholder="09xxxxxxxxx" />
          </div>
          <div>
            <div class="label">Discount reason (required if discount > 0)</div>
            <input id="discountReason" class="input" placeholder="bulk discount / promo / etc." />
          </div>
        </div>

        <div style="margin-top:10px">
          <div class="label">Notes</div>
          <textarea id="notes" class="input" placeholder="Optional notes…"></textarea>
        </div>

        <div class="hr"></div>

        <div class="grid cols-2">
          <div class="card" style="padding:12px">
            <div class="h2">Add items (quick)</div>
            <div class="muted small">Type SKU then Enter. You can also paste multiple lines (SKU qty).</div>
            <div class="row" style="margin-top:10px">
              <input id="skuInput" class="input" placeholder="SKU (e.g., SBG-BLK)" style="flex:1" />
              <button class="btn" id="btnAddSku">Add</button>
            </div>
            <div class="label" style="margin-top:10px">Bulk paste</div>
            <textarea id="bulkPaste" class="input" placeholder="Example:\nSBG-BLK 10\nP23 3\nCKL-WHT 5"></textarea>
            <div class="row" style="margin-top:10px">
              <button class="btn" id="btnParse">Add pasted lines</button>
            </div>
            <div class="muted small" style="margin-top:10px">Tip: Stock badge shows current qty_on_hand.</div>
          </div>

          <div class="card" style="padding:12px">
            <div class="h2">Selected items</div>
            <div class="tablewrap" style="margin-top:10px">
              <table style="min-width:700px">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>NAME</th>
                    <th>STOCK</th>
                    <th>QTY</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody id="itemsBody"></tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="row">
          <button class="btn primary" id="btnSubmit">Submit order</button>
          <span class="muted small" id="helperText">Orders auto-deduct inventory. Online orders auto-calc courier cost + commission.</span>
        </div>
      </div>
    `);

    const itemsMap = new Map(); // sku -> {sku, qty, product}

    function refreshItems(){
      const tbody = document.getElementById('itemsBody');
      tbody.innerHTML = '';
      for(const [sku, obj] of itemsMap.entries()){
        tbody.insertAdjacentHTML('beforeend', itemRowTemplate(obj.product, obj.qty));
      }
      tbody.querySelectorAll('tr').forEach(tr=>{
        const sku = tr.dataset.sku;
        tr.querySelector('.rm').onclick = () => { itemsMap.delete(sku); refreshItems(); };
        tr.querySelector('.qty').onchange = (e) => {
          const v = Math.max(1, parseInt(e.target.value || '1', 10));
          itemsMap.get(sku).qty = v;
        };
      });
    }

    function addSku(sku, qty=1){
      sku = (sku||'').trim();
      if(!sku) return;
      const p = productsCache.find(x => String(x.sku).toLowerCase() === sku.toLowerCase());
      if(!p){ toast(`SKU not found: ${sku}`, 'error'); return; }
      const cur = itemsMap.get(p.sku);
      if(cur) cur.qty += qty;
      else itemsMap.set(p.sku, { sku: p.sku, qty: qty, product: p });
      refreshItems();
    }

    const skuInput = document.getElementById('skuInput');
    document.getElementById('btnAddSku').onclick = () => { addSku(skuInput.value, 1); skuInput.value=''; skuInput.focus(); };
    skuInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){
        e.preventDefault();
        addSku(skuInput.value, 1);
        skuInput.value='';
      }
    });

    document.getElementById('btnParse').onclick = () => {
      const txt = document.getElementById('bulkPaste').value;
      const lines = txt.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      for(const line of lines){
        const m = line.split(/\s+/);
        const sku = m[0];
        const qty = m[1] ? parseInt(m[1], 10) : 1;
        addSku(sku, Number.isFinite(qty) && qty>0 ? qty : 1);
      }
      document.getElementById('bulkPaste').value = '';
    };

    const orderType = document.getElementById('orderType');
    const regionWrap = document.getElementById('regionWrap');
    const shipWrap = document.getElementById('shipWrap');

    function toggleShipping(){
      const t = orderType.value;
      const online = (t === 'online');
      regionWrap.style.display = online ? '' : 'none';
      shipWrap.style.display = online ? '' : 'none';
    }
    orderType.onchange = toggleShipping;
    toggleShipping();

    document.getElementById('btnSubmit').onclick = async () => {
      const t = orderType.value;
      const region = document.getElementById('region').value;
      const shippingPaid = Number(document.getElementById('shippingPaid').value || 0);
      const discount = Number(document.getElementById('discount').value || 0);
      const discountReason = (document.getElementById('discountReason').value || '').trim();

      const customerName = (document.getElementById('customerName').value || '').trim();
      const fbLink = (document.getElementById('fbLink').value || '').trim();
      const phone = (document.getElementById('phone').value || '').trim();
      const notes = (document.getElementById('notes').value || '').trim();

      if(!customerName){ toast('Customer name is required.', 'error'); return; }
      if(t === 'walkin' && !phone){ toast('Phone number is required for Walk-in orders.', 'error'); return; }
      if(discount > 0 && !discountReason){ toast('Discount reason is required when discount > 0.', 'error'); return; }
      if(itemsMap.size === 0){ toast('Add at least 1 item.', 'error'); return; }

      const items = Array.from(itemsMap.values()).map(x=>({ sku: x.sku, qty: x.qty }));

      const payload = {
        p_order_type: t,
        p_region: t==='online' ? region : null,
        p_shipping_paid: t==='online' ? shippingPaid : 0,
        p_discount_amount: discount,
        p_discount_reason: discountReason,
        p_customer_name: customerName,
        p_profile_link: fbLink,
        p_phone_number: phone,
        p_notes: notes,
        p_items: items
      };

      const { data, error } = await supabase.rpc('create_order_v3', payload);
      if(error){ toast(error.message, 'error'); return; }
      toast('Order submitted.');
      location.hash = `#/order?id=${encodeURIComponent(data)}`; // data is UUID
    };
  }

  // -----------------
  // Order Details
  // -----------------
  async function renderOrderDetails(){
    if(!requireAuth()) return;
    const idParam = (qs().get('id') || '').trim();
    if(!idParam){
      render(`<div class="card"><div class="h1">Missing order id</div><div class="muted">Open from Orders list.</div></div>`);
      return;
    }

    const isCode = /^ORD-/i.test(idParam);
    const col = isCode ? 'order_code' : 'id';

    // Use orders (not view) to get discount metadata fields and created_by
    const { data: order, error } = await supabase
      .from('orders')
      .select('id, order_code, created_at, updated_at, order_type, status, customer_name, profile_link, phone_number, notes, region, shipping_paid, courier_cost, created_by, discount_amount, discount_reason, discount_updated_by, discount_updated_at')
      .eq(col, idParam)
      .maybeSingle();

    if(error) throw new Error(error.message);
    if(!order){
      render(`<div class="card error"><div class="h1">Order not found / no access</div><div class="muted">Check you are in the correct Supabase project and RLS policies are applied.</div></div>`);
      return;
    }

    const role = profile.role;
    const isOwner = (role === 'owner' || role === 'admin');
    const canEdit = isOwner || (order.created_by === session.user.id);

    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, sku, qty, category_at_time, unit_cost_at_time, sell_price_at_time, created_at')
      .eq('order_id', order.id)
      .order('created_at', { ascending:true });

    if(itemsErr) throw new Error(itemsErr.message);

    // fetch names in batch
    const skus = Array.from(new Set((items||[]).map(x=>x.sku)));
    let nameMap = {};
    if(skus.length){
      const { data: ps, error: pe } = await supabase
        .from('products')
        .select('sku, name')
        .in('sku', skus);
      if(pe) throw new Error(pe.message);
      for(const p of (ps||[])) nameMap[p.sku] = p.name;
    }

    const itemsRows = (items||[]).map(it=>{
      const lineTotal = Number(it.sell_price_at_time||0) * Number(it.qty||0);
      return `
        <tr data-item-id="${escapeHtml(it.id)}">
          <td><b>${escapeHtml(it.sku)}</b><div class="muted small">${escapeHtml(it.category_at_time||'')}</div></td>
          <td>${escapeHtml(nameMap[it.sku] || '')}</td>
          <td>${it.qty}</td>
          <td>${fmtPeso(it.sell_price_at_time)}</td>
          <td>${fmtPeso(lineTotal)}</td>
        </tr>
      `;
    }).join('');

    const itemsSubtotal = (items||[]).reduce((a,it)=>a + (Number(it.sell_price_at_time||0)*Number(it.qty||0)), 0);
    const itemsCogs = (items||[]).reduce((a,it)=>a + (Number(it.unit_cost_at_time||0)*Number(it.qty||0)), 0);
    const discount = Number(order.discount_amount||0);
    const itemsAfter = Math.max(itemsSubtotal - discount, 0);
    const itemsProfit = itemsAfter - itemsCogs;

    const isOnline = (String(order.order_type).toLowerCase() === 'online');
    const shippingProfit = isOnline ? Math.max(Number(order.shipping_paid||0) - Number(order.courier_cost||0), 0) : 0;

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">Order Details — ${escapeHtml(order.order_code)}</div>
            <div class="muted small">Created: ${new Date(order.created_at).toLocaleString()} • Updated: ${new Date(order.updated_at || order.created_at).toLocaleString()}</div>
          </div>
          <a class="btn" href="#/orders">Back to Orders</a>
        </div>

        <div class="hr"></div>

        <div class="grid cols-3">
          <div class="kpi">
            <div class="num">${fmtPeso(itemsAfter)}</div>
            <div class="cap">Items total (after discount)</div>
            <div class="muted small">Subtotal ${fmtPeso(itemsSubtotal)} • Discount ${fmtPeso(discount)}</div>
          </div>
          <div class="kpi">
            <div class="num">${fmtPeso(shippingProfit)}</div>
            <div class="cap">Shipping profit</div>
            <div class="muted small">${isOnline ? `Paid ${fmtPeso(order.shipping_paid)} • Courier ${fmtPeso(order.courier_cost)} (${escapeHtml(order.region||'')})` : 'Not an online order'}</div>
          </div>
          <div class="kpi">
            <div class="num">${fmtPeso(itemsProfit + shippingProfit)}</div>
            <div class="cap">Gross profit (before commission)</div>
            <div class="muted small">COGS ${fmtPeso(itemsCogs)}</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="h2">Customer</div>
            <div class="muted small">Name</div>
            <div style="font-weight:900">${escapeHtml(order.customer_name)}</div>
            <div class="muted small" style="margin-top:8px">Facebook</div>
            ${order.profile_link ? `<a class="btn" target="_blank" rel="noopener" href="${escapeHtml(order.profile_link)}">Open FB link</a>` : `<div class="muted small">—</div>`}
            <div class="muted small" style="margin-top:8px">Phone</div>
            <div>${escapeHtml(order.phone_number||'—')}</div>
            <div class="muted small" style="margin-top:8px">Notes</div>
            <div class="small">${escapeHtml(order.notes||'—')}</div>
          </div>

          <div>
            <div class="h2">Status & Discount</div>
            <div class="grid cols-2">
              <div>
                <div class="label">Status</div>
                <select id="st" class="input" ${canEdit?'':'disabled'}>
                  ${['pending','paid','packed','shipped','completed','cancelled'].map(s => `<option value="${s}" ${String(order.status).toLowerCase()===s?'selected':''}>${s}</option>`).join('')}
                </select>
              </div>
              <div>
                <div class="label">Discount (₱)</div>
                <input id="disc" class="input" type="number" min="0" step="1" value="${discount}" ${canEdit?'':'disabled'} />
              </div>
            </div>
            <div style="margin-top:10px">
              <div class="label">Discount reason (required if discount > 0)</div>
              <input id="discReason" class="input" value="${escapeHtml(order.discount_reason||'')}" ${canEdit?'':'disabled'} />
            </div>
            <div class="row" style="margin-top:10px">
              <button class="btn primary" id="btnSave" ${canEdit?'':'disabled'}>Save</button>
              <span class="muted small">${canEdit ? 'Edits are logged.' : 'Staff can only edit orders they created.'}</span>
            </div>

            ${isOwner ? `
              <div class="hr"></div>
              <div class="h2">Edit Items (Owner/Admin)</div>
              <div class="muted small">This will recalc totals + inventory. If discount becomes higher than new subtotal, it will error.</div>
              <div class="label" style="margin-top:10px">Replace items (paste JSON array)</div>
              <textarea id="itemsJson" class="input" placeholder='Example: [{"sku":"SBG-BLK","qty":10},{"sku":"P23","qty":2}]'></textarea>
              <div class="row" style="margin-top:10px">
                <button class="btn" id="btnLoadJson">Load current</button>
                <button class="btn danger" id="btnReplace">Replace items</button>
              </div>
            ` : ''}

          </div>
        </div>

        <div class="hr"></div>

        <div class="h2">Items</div>
        <div class="tablewrap" style="margin-top:10px">
          <table style="min-width:900px">
            <thead>
              <tr>
                <th>SKU</th>
                <th>NAME</th>
                <th>QTY</th>
                <th>SELL PRICE</th>
                <th>LINE TOTAL</th>
              </tr>
            </thead>
            <tbody>${itemsRows || ''}</tbody>
          </table>
        </div>
      </div>
    `);

    document.getElementById('btnSave')?.addEventListener('click', async ()=>{
      const st = document.getElementById('st').value;
      const disc = Number(document.getElementById('disc').value || 0);
      const reason = (document.getElementById('discReason').value || '').trim();
      if(disc > 0 && !reason){ toast('Discount reason is required when discount > 0.', 'error'); return; }

      const { error } = await supabase.rpc('staff_update_order', {
        p_order_id: order.id,
        p_status: st,
        p_discount_amount: disc,
        p_discount_reason: reason
      });
      if(error) toast(error.message, 'error');
      else { toast('Saved.'); reroute(); }
    });

    if(isOwner){
      document.getElementById('btnLoadJson')?.addEventListener('click', ()=>{
        const arr = (items||[]).map(x=>({ sku: x.sku, qty: x.qty }));
        document.getElementById('itemsJson').value = JSON.stringify(arr, null, 2);
      });
      document.getElementById('btnReplace')?.addEventListener('click', async ()=>{
        let arr;
        try{
          arr = JSON.parse(document.getElementById('itemsJson').value || '[]');
        }catch(e){
          toast('Invalid JSON.', 'error'); return;
        }
        if(!Array.isArray(arr) || arr.length===0){ toast('Provide at least 1 item in JSON array.', 'error'); return; }
        const { error } = await supabase.rpc('owner_replace_order_items', { p_order_id: order.id, p_items: arr });
        if(error) toast(error.message, 'error');
        else { toast('Items replaced.'); reroute(); }
      });
    }
  }

  // -----------------
  // Commission report (staff)
  // -----------------
  async function renderMyCommission(){
    if(!requireAuth()) return;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const fmtDate = (d)=> d.toISOString().slice(0,10);

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">My Commission</div>
            <div class="muted">Commission is <b>30%</b> of <b>shipping profit</b> for Online orders you created.</div>
          </div>
        </div>
        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="label">Start date</div>
            <input id="d1" class="input" type="date" value="${fmtDate(start)}" />
          </div>
          <div>
            <div class="label">End date</div>
            <input id="d2" class="input" type="date" value="${fmtDate(today)}" />
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="btnRun">Run</button>
        </div>

        <div class="hr"></div>
        <div id="out" class="muted small">Pick dates then Run.</div>
      </div>
    `);

    document.getElementById('btnRun').onclick = async ()=>{
      const d1 = document.getElementById('d1').value;
      const d2 = document.getElementById('d2').value;
      const { data, error } = await supabase.rpc('my_commission_report', { p_start: d1, p_end: d2 });
      if(error){ toast(error.message, 'error'); return; }
      const total = (data||[]).reduce((a,x)=>a+Number(x.commission||0),0);
      const rows = (data||[]).map(x=>`
        <tr>
          <td>${escapeHtml(x.order_code)}</td>
          <td>${new Date(x.created_at).toLocaleString()}</td>
          <td>${escapeHtml(x.region||'')}</td>
          <td>${fmtPeso(x.shipping_paid)}</td>
          <td>${fmtPeso(x.commission)}</td>
        </tr>
      `).join('');
      document.getElementById('out').innerHTML = `
        <div class="row">
          <div class="kpi" style="flex:1">
            <div class="num">${fmtPeso(total)}</div>
            <div class="cap">Total commission</div>
          </div>
        </div>
        <div class="tablewrap" style="margin-top:12px">
          <table style="min-width:700px">
            <thead><tr><th>ORDER</th><th>DATE</th><th>REGION</th><th>SHIPPING PAID</th><th>COMMISSION</th></tr></thead>
            <tbody>${rows || ''}</tbody>
          </table>
        </div>
      `;
    };
  }

  // -----------------
  // Owner pages (basic)
  // -----------------
  async function renderDashboard(){
    if(!requireAuth()) return;
    if(!requireOwner()) return;

    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const fmtDate = (d)=> d.toISOString().slice(0,10);

    render(`
      <div class="card">
        <div class="h1">Owner Dashboard</div>
        <div class="muted">Summary uses order financials + expenses + receivables + payables.</div>
        <div class="hr"></div>

        <div class="grid cols-2">
          <div>
            <div class="label">Start date</div>
            <input id="d1" class="input" type="date" value="${fmtDate(start)}" />
          </div>
          <div>
            <div class="label">End date</div>
            <input id="d2" class="input" type="date" value="${fmtDate(today)}" />
          </div>
        </div>

        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="btnRun">Run</button>
        </div>

        <div class="hr"></div>
        <div id="out" class="muted small">Pick dates then Run.</div>
      </div>
    `);

    document.getElementById('btnRun').onclick = async ()=>{
      const d1 = document.getElementById('d1').value;
      const d2 = document.getElementById('d2').value;

      const { data: s, error } = await supabase.rpc('owner_dashboard_summary', { p_start: d1, p_end: d2 });
      if(error){ toast(error.message, 'error'); return; }
      const x = (s && s[0]) || null;
      if(!x){ document.getElementById('out').textContent = 'No data.'; return; }

      const { data: byCat } = await supabase.rpc('owner_profit_by_category', { p_start: d1, p_end: d2 });
      const { data: byType } = await supabase.rpc('owner_summary_by_order_type', { p_start: d1, p_end: d2 });

      const catRows = (byCat||[]).map(r=>`<tr><td>${escapeHtml(r.category||'')}</td><td>${fmtPeso(r.profit)}</td></tr>`).join('');
      const typeRows = (byType||[]).map(r=>`<tr><td>${escapeHtml(r.order_type||'')}</td><td>${fmtPeso(r.order_profit)}</td></tr>`).join('');

      document.getElementById('out').innerHTML = `
        <div class="grid cols-3">
          <div class="kpi"><div class="num">${fmtPeso(x.order_profit)}</div><div class="cap">Order profit</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.expenses_total)}</div><div class="cap">Operational expenses</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.net_after_expenses)}</div><div class="cap">Net after expenses</div></div>
        </div>

        <div class="grid cols-3" style="margin-top:12px">
          <div class="kpi"><div class="num">${fmtPeso(x.items_profit)}</div><div class="cap">Items profit</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.shipping_profit)}</div><div class="cap">Shipping profit</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.commission_total)}</div><div class="cap">Commission to pay</div></div>
        </div>

        <div class="grid cols-2" style="margin-top:12px">
          <div class="kpi"><div class="num">${fmtPeso(x.receivables_outstanding)}</div><div class="cap">Receivables outstanding</div></div>
          <div class="kpi"><div class="num">${fmtPeso(x.payables_outstanding)}</div><div class="cap">Payables outstanding</div></div>
        </div>

        <div class="hr"></div>
        <div class="grid cols-2">
          <div>
            <div class="h2">Profit by category</div>
            <div class="tablewrap">
              <table style="min-width:420px">
                <thead><tr><th>Category</th><th>Profit</th></tr></thead>
                <tbody>${catRows || ''}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="h2">Profit by order type</div>
            <div class="tablewrap">
              <table style="min-width:420px">
                <thead><tr><th>Order Type</th><th>Profit</th></tr></thead>
                <tbody>${typeRows || ''}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    };
  }

  async function renderProducts(){
    if(!requireAuth()) return;
    if(!requireOwner()) return;

    const { data, error } = await supabase
      .from('products')
      .select('sku, name, category, unit_cost, sell_price, active')
      .order('category', { ascending:true })
      .order('sku', { ascending:true });

    if(error) throw new Error(error.message);

    const rows = (data||[]).map(p=>`
      <tr>
        <td><b>${escapeHtml(p.sku)}</b></td>
        <td><input class="input name" data-sku="${escapeHtml(p.sku)}" value="${escapeHtml(p.name)}" /></td>
        <td><input class="input cat" data-sku="${escapeHtml(p.sku)}" value="${escapeHtml(p.category)}" /></td>
        <td><input class="input cost" data-sku="${escapeHtml(p.sku)}" type="number" step="0.01" value="${Number(p.unit_cost||0)}" /></td>
        <td><input class="input price" data-sku="${escapeHtml(p.sku)}" type="number" step="0.01" value="${Number(p.sell_price||0)}" /></td>
        <td>
          <select class="input act" data-sku="${escapeHtml(p.sku)}" style="padding:8px 10px">
            <option value="true" ${p.active?'selected':''}>active</option>
            <option value="false" ${!p.active?'selected':''}>archived</option>
          </select>
        </td>
        <td><button class="btn primary saveProd" data-sku="${escapeHtml(p.sku)}">Save</button></td>
      </tr>
    `).join('');

    render(`
      <div class="card">
        <div class="row">
          <div class="grow">
            <div class="h1">Products</div>
            <div class="muted">Add/edit SKUs, cost, price. Archive instead of delete.</div>
          </div>
        </div>
        <div class="hr"></div>

        <div class="grid cols-3">
          <div>
            <div class="label">SKU</div>
            <input id="newSku" class="input" placeholder="NEW-SKU" />
          </div>
          <div>
            <div class="label">Name</div>
            <input id="newName" class="input" placeholder="Product name" />
          </div>
          <div>
            <div class="label">Category</div>
            <input id="newCat" class="input" placeholder="BOXER / EARRING / ..." />
          </div>
        </div>
        <div class="grid cols-3" style="margin-top:10px">
          <div>
            <div class="label">Unit cost</div>
            <input id="newCost" class="input" type="number" step="0.01" value="0" />
          </div>
          <div>
            <div class="label">Sell price</div>
            <input id="newPrice" class="input" type="number" step="0.01" value="0" />
          </div>
          <div class="row" style="align-items:end">
            <button class="btn primary" id="btnAdd">Add SKU</button>
          </div>
        </div>

        <div class="hr"></div>
        <div class="tablewrap">
          <table style="min-width:980px">
            <thead>
              <tr><th>SKU</th><th>Name</th><th>Category</th><th>Unit cost</th><th>Sell price</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>${rows || ''}</tbody>
          </table>
        </div>
      </div>
    `);

    document.getElementById('btnAdd').onclick = async ()=>{
      const sku = document.getElementById('newSku').value.trim();
      const name = document.getElementById('newName').value.trim();
      const category = document.getElementById('newCat').value.trim();
      const unit_cost = Number(document.getElementById('newCost').value || 0);
      const sell_price = Number(document.getElementById('newPrice').value || 0);
      if(!sku || !name || !category){ toast('SKU, Name, Category are required.', 'error'); return; }

      const { error } = await supabase.from('products').insert({ sku, name, category, unit_cost, sell_price, active:true });
      if(error) toast(error.message, 'error');
      else { toast('Added.'); productsCache=null; reroute(); }
    };

    document.querySelectorAll('.saveProd').forEach(btn=>{
      btn.onclick = async ()=>{
        const sku = btn.dataset.sku;
        const name = document.querySelector(`.name[data-sku="${CSS.escape(sku)}"]`).value.trim();
        const category = document.querySelector(`.cat[data-sku="${CSS.escape(sku)}"]`).value.trim();
        const unit_cost = Number(document.querySelector(`.cost[data-sku="${CSS.escape(sku)}"]`).value || 0);
        const sell_price = Number(document.querySelector(`.price[data-sku="${CSS.escape(sku)}"]`).value || 0);
        const active = document.querySelector(`.act[data-sku="${CSS.escape(sku)}"]`).value === 'true';

        const { error } = await supabase.from('products').update({ name, category, unit_cost, sell_price, active }).eq('sku', sku);
        if(error) toast(error.message, 'error');
        else { toast('Saved.'); productsCache=null; }
      };
    });
  }

  async function renderInventory(){
    if(!requireAuth()) return;
    if(!requireOwner()) return;

    const { data, error } = await supabase
      .from('inventory_view')
      .select('*')
      .order('category', { ascending:true })
      .order('sku', { ascending:true });

    if(error) throw new Error(error.message);

    const rows = (data||[]).map(r=>`
      <tr>
        <td><b>${escapeHtml(r.sku)}</b></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.category)}</td>
        <td><span class="pill ${(r.qty_on_hand<=0)?'bad':(r.qty_on_hand<5)?'warn':'good'}">${r.qty_on_hand}</span></td>
        <td>
          <input class="input adjQty" data-sku="${escapeHtml(r.sku)}" type="number" step="1" value="0" />
          <div class="muted small">Use negative to deduct</div>
        </td>
        <td>
          <input class="input adjReason" data-sku="${escapeHtml(r.sku)}" value="manual_adjust" />
        </td>
        <td><button class="btn primary adjBtn" data-sku="${escapeHtml(r.sku)}">Apply</button></td>
      </tr>
    `).join('');

    render(`
      <div class="card">
        <div class="h1">Inventory</div>
        <div class="muted">Manual adjustments (owner only). Orders auto-deduct stock.</div>
        <div class="hr"></div>

        <div class="tablewrap">
          <table style="min-width:980px">
            <thead>
              <tr><th>SKU</th><th>Name</th><th>Category</th><th>On hand</th><th>Adjust qty</th><th>Reason</th><th></th></tr>
            </thead>
            <tbody>${rows || ''}</tbody>
          </table>
        </div>
      </div>
    `);

    document.querySelectorAll('.adjBtn').forEach(btn=>{
      btn.onclick = async ()=>{
        const sku = btn.dataset.sku;
        const qty = parseInt(document.querySelector(`.adjQty[data-sku="${CSS.escape(sku)}"]`).value || '0', 10);
        const reason = document.querySelector(`.adjReason[data-sku="${CSS.escape(sku)}"]`).value.trim();
        if(!qty){ toast('Enter adjust qty (non-zero).', 'error'); return; }
        const { error } = await supabase.rpc('owner_adjust_stock', { p_sku: sku, p_qty_change: qty, p_reason: reason });
        if(error) toast(error.message, 'error');
        else { toast('Adjusted.'); productsCache=null; reroute(); }
      };
    });
  }

  async function renderSimpleOwnerTable(opts){
    const { title, table, cols, insertCols, dateCol } = opts;
    if(!requireAuth()) return;
    if(!requireOwner()) return;

    const { data, error } = await supabase.from(table).select('*').order(dateCol || 'created_at', { ascending:false }).limit(200);
    if(error) throw new Error(error.message);

    const head = cols.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('') + `<th></th>`;
    const body = (data||[]).map(r=>{
      const tds = cols.map(c=>{
        const v = r[c.key];
        if(c.type === 'number') return `<td><input class="input" data-k="${c.key}" data-id="${r.id}" type="number" step="0.01" value="${Number(v||0)}"></td>`;
        if(c.type === 'date') return `<td><input class="input" data-k="${c.key}" data-id="${r.id}" type="date" value="${String(v||'').slice(0,10)}"></td>`;
        return `<td><input class="input" data-k="${c.key}" data-id="${r.id}" value="${escapeHtml(v||'')}"></td>`;
      }).join('');
      return `<tr data-id="${r.id}">${tds}<td><button class="btn primary saveRow" data-id="${r.id}">Save</button></td></tr>`;
    }).join('');

    render(`
      <div class="card">
        <div class="h1">${escapeHtml(title)}</div>
        <div class="muted">Owner-only. Latest 200 rows.</div>
        <div class="hr"></div>

        <div class="grid cols-3">
          ${insertCols.map(c=>`
            <div>
              <div class="label">${escapeHtml(c.label)}</div>
              <input id="new_${c.key}" class="input" ${c.type==='number'?'type="number" step="0.01" value="0"':(c.type==='date'?'type="date"':'')} />
            </div>
          `).join('')}
        </div>
        <div class="row" style="margin-top:12px">
          <button class="btn primary" id="btnAdd">Add</button>
        </div>

        <div class="hr"></div>
        <div class="tablewrap">
          <table style="min-width:980px">
            <thead><tr>${head}</tr></thead>
            <tbody>${body || ''}</tbody>
          </table>
        </div>
      </div>
    `);

    document.getElementById('btnAdd').onclick = async ()=>{
      const row = {};
      for(const c of insertCols){
        const el = document.getElementById('new_'+c.key);
        let v = el.value;
        if(c.type === 'number') v = Number(v||0);
        row[c.key] = v;
      }
      const { error } = await supabase.from(table).insert(row);
      if(error) toast(error.message, 'error');
      else { toast('Added.'); reroute(); }
    };

    document.querySelectorAll('.saveRow').forEach(btn=>{
      btn.onclick = async ()=>{
        const id = btn.dataset.id;
        const updates = {};
        cols.forEach(c=>{
          const el = document.querySelector(`input[data-k="${c.key}"][data-id="${CSS.escape(id)}"]`);
          if(!el) return;
          updates[c.key] = (c.type === 'number') ? Number(el.value||0) : el.value;
        });
        const { error } = await supabase.from(table).update(updates).eq('id', id);
        if(error) toast(error.message, 'error'); else toast('Saved.');
      };
    });
  }

  async function renderExpenses(){
    return renderSimpleOwnerTable({
      title:'Operational Expenses',
      table:'expenses',
      dateCol:'expense_date',
      cols:[
        { key:'expense_date', label:'Date', type:'date' },
        { key:'category', label:'Category' },
        { key:'amount', label:'Amount', type:'number' },
        { key:'notes', label:'Notes' },
      ],
      insertCols:[
        { key:'expense_date', label:'Date', type:'date' },
        { key:'category', label:'Category' },
        { key:'amount', label:'Amount', type:'number' },
        { key:'notes', label:'Notes' },
      ]
    });
  }

  async function renderReceivables(){
    return renderSimpleOwnerTable({
      title:'Receivables (Unpaid / Downpayment / Balance)',
      table:'receivables',
      cols:[
        { key:'party', label:'Party' },
        { key:'amount_due', label:'Amount due', type:'number' },
        { key:'amount_paid', label:'Amount paid', type:'number' },
        { key:'status', label:'Status (open/partial/closed)' },
      ],
      insertCols:[
        { key:'party', label:'Party' },
        { key:'amount_due', label:'Amount due', type:'number' },
        { key:'amount_paid', label:'Amount paid', type:'number' },
        { key:'status', label:'Status (open/partial/closed)' },
      ]
    });
  }

  async function renderPayables(){
    return renderSimpleOwnerTable({
      title:'Payables (Supplier balance / Bonuses / Refunds)',
      table:'payables',
      cols:[
        { key:'party', label:'Party' },
        { key:'amount', label:'Amount', type:'number' },
        { key:'status', label:'Status (open/partial/closed)' },
        { key:'notes', label:'Notes' },
      ],
      insertCols:[
        { key:'party', label:'Party' },
        { key:'amount', label:'Amount', type:'number' },
        { key:'status', label:'Status (open/partial/closed)' },
        { key:'notes', label:'Notes' },
      ]
    });
  }

  // Kick off
  init();
})();

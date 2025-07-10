/*
    The following SQL queries are used to generate example charts in charts.html
    These queries must be entered into the WMS Pulse Query Editor and saved with the
    specified Query ID (title can be whatever you wish).
*/

/* Query ID: db_pa_by_loc */
select q.location LOCATION, count(*) PA_ITEMS
from queue q, unit u, mast m
where u.stock_code=m.stock_code and
    q.destination like 'STRM%' and
    q.queue='MM' AND
    ((q.item = u.unit_number and u.staged='X' and u.selected is null and u.int_order_number is null) or
    (q.item = u.cart_number and u.staged='X' and u.selected is null and u.int_order_number is null)) and
    ((cart_flag='U' and item not in (select unit_number
    from unit
    where selected='X' or linked='X')) or
    (cart_flag='C' and item not in (select cart_number
    from cart
    where selected = 'X') and item not in (select cart_number
    from unit
    where linked='X')))
group by q.location
order by 2 desc

/* Query ID: db_cycle_ct_summary */
SELECT
    begin_date "Begin Date"
, SUM(Required) "Required Locs"
, SUM(Completed) "Completed Locs"
, SUM(Required) - SUM(Completed) "Incomplete Locs"
, SUM(total_items) "Total Counted"
, SUM(correct) "Total Correct"
, SUM(total_items) - SUM(correct) "Total Incorrect"
FROM cyc
WHERE cyc.begin_date >= ADD_MONTHS(trunc(sysdate,'mm'),-2)
    AND required > 0
GROUP BY begin_date
ORDER BY 1, 2
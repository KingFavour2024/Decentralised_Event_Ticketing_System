import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

const CONTRACT_NAME = 'event-ticketing';
const EVENT_NAME = 'Test Concert';
const EVENT_DESCRIPTION = 'A test concert for the smart contract';
const EVENT_VENUE = 'Test Venue';
const EVENT_CATEGORY = 'Music';
const TOTAL_TICKETS = 100;
const TICKET_PRICE = 50000000; // 50 STX
const REFUND_WINDOW = 100; // 100 blocks

Clarinet.test({
    name: "Ensure that contract owner can create an event",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const futureDate = chain.blockHeight + 1000;

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Assert that the transaction was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the event was created by querying the contract
        const event = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        // Assert that the event data is correct
        const eventData = event.result.expectSome().expectTuple();
        assertEquals(eventData['name'].expectUtf8(), EVENT_NAME);
        assertEquals(eventData['description'].expectUtf8(), EVENT_DESCRIPTION);
        assertEquals(eventData['organizer'].expectPrincipal(), deployer.address);
        assertEquals(eventData['venue'].expectUtf8(), EVENT_VENUE);
        assertEquals(eventData['date'].expectUint(), futureDate);
        assertEquals(eventData['total-tickets'].expectUint(), TOTAL_TICKETS);
        assertEquals(eventData['tickets-sold'].expectUint(), 0);
        assertEquals(eventData['ticket-price'].expectUint(), TICKET_PRICE);
        assertEquals(eventData['is-active'].expectBool(), true);
        assertEquals(eventData['refund-window'].expectUint(), REFUND_WINDOW);
        assertEquals(eventData['revenue'].expectUint(), 0);
        assertEquals(eventData['category'].expectUtf8(), EVENT_CATEGORY);
    },
});

Clarinet.test({
    name: "Ensure event creation fails with an invalid ticket price",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const futureDate = chain.blockHeight + 1000;
        const invalidTicketPrice = 100; // Less than minimum ticket price

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(invalidTicketPrice),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Assert that the transaction failed with ERR-INVALID-PRICE
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${5})`); // ERR-INVALID-PRICE
    },
});

Clarinet.test({
    name: "Ensure event creation fails with an expired date",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const pastDate = chain.blockHeight - 100; // A date in the past

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(pastDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Assert that the transaction failed with ERR-EVENT-EXPIRED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${6})`); // ERR-EVENT-EXPIRED
    },
});

Clarinet.test({
    name: "Ensure users can purchase a ticket for an event",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;

        // First, create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // Now purchase a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Assert that the purchase was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the ticket was created
        const ticket = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-ticket',
            [types.uint(1)], // ticket ID 1
            user1.address
        );

        const ticketData = ticket.result.expectSome().expectTuple();
        assertEquals(ticketData['event-id'].expectUint(), 1);
        assertEquals(ticketData['owner'].expectPrincipal(), user1.address);
        assertEquals(ticketData['purchase-price'].expectUint(), TICKET_PRICE);
        assertEquals(ticketData['is-used'].expectBool(), false);
        assertEquals(ticketData['is-refunded'].expectBool(), false);

        // Verify the event was updated
        const event = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventData = event.result.expectSome().expectTuple();
        assertEquals(eventData['tickets-sold'].expectUint(), 1);
        assertEquals(eventData['revenue'].expectUint(), TICKET_PRICE);

        // Verify the user tickets were updated
        const userTickets = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-user-tickets',
            [types.principal(user1.address)],
            user1.address
        );

        const userTicketsData = userTickets.result.expectSome().expectTuple();
        const ownedTickets = userTicketsData['owned-tickets'].expectList();
        assertEquals(ownedTickets.length, 1);
        assertEquals(ownedTickets[0].expectUint(), 1);
    },
});

Clarinet.test({
    name: "Ensure ticket purchase fails when event is sold out",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;
        const futureDate = chain.blockHeight + 1000;
        const totalTickets = 1; // Only 1 ticket available

        // Create an event with only 1 ticket
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(totalTickets),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // First user buys the only ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // Second user tries to buy a ticket, should fail
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user2.address
            )
        ]);

        // Assert that the purchase failed with ERR-SOLD-OUT
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${3})`); // ERR-SOLD-OUT
    },
});

Clarinet.test({
    name: "Ensure organizer can validate a ticket",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Organizer validates the ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'validate-ticket',
                [types.uint(1)], // ticket ID 1
                deployer.address
            )
        ]);

        // Assert that the validation was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the ticket was marked as used
        const ticket = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-ticket',
            [types.uint(1)],
            deployer.address
        );

        const ticketData = ticket.result.expectSome().expectTuple();
        assertEquals(ticketData['is-used'].expectBool(), true);
    },
});

Clarinet.test({
    name: "Ensure non-organizer cannot validate a ticket",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!; // Not the organizer
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Non-organizer tries to validate the ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'validate-ticket',
                [types.uint(1)], // ticket ID 1
                user2.address
            )
        ]);

        // Assert that the validation failed with ERR-NOT-AUTHORIZED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${1})`); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure ticket owner can request a refund within the refund window",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;
        const refundWindow = 100; // 100 blocks

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(refundWindow),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // User requests a refund
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user1.address
            )
        ]);

        // Assert that the refund was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the ticket was marked as refunded
        const ticket = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-ticket',
            [types.uint(1)],
            user1.address
        );

        const ticketData = ticket.result.expectSome().expectTuple();
        assertEquals(ticketData['is-refunded'].expectBool(), true);

        // Verify the event revenue was updated
        const event = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventData = event.result.expectSome().expectTuple();
        assertEquals(eventData['revenue'].expectUint(), 0); // Revenue should be back to 0
    },
});

Clarinet.test({
    name: "Ensure refund fails outside the refund window",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;
        const refundWindow = 10; // 10 blocks

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(refundWindow),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Mine several blocks to go beyond the refund window
        for (let i = 0; i < refundWindow + 1; i++)
        {
            chain.mineBlock([]);
        }

        // User tries to request a refund after the window
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user1.address
            )
        ]);

        // Assert that the refund failed with ERR-REFUND-WINDOW-CLOSED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${11})`); // ERR-REFUND-WINDOW-CLOSED
    },
});

Clarinet.test({
    name: "Ensure non-owner cannot request a refund for a ticket",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!; // Not the ticket owner
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User1 purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // User2 tries to request a refund for User1's ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user2.address
            )
        ]);

        // Assert that the refund failed with ERR-NOT-AUTHORIZED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${1})`); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure contract owner can update platform fee",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const newFee = 10; // 10%

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'update-platform-fee',
                [types.uint(newFee)],
                deployer.address
            )
        ]);

        // Assert that the update was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the platform fee was updated by checking the calculate-platform-fee function
        const testAmount = 1000000;
        const expectedFee = Math.floor((testAmount * newFee) / 100);

        const feeCalculation = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'calculate-platform-fee',
            [types.uint(testAmount)],
            deployer.address
        );

        assertEquals(feeCalculation.result.expectUint(), expectedFee);
    },
});

Clarinet.test({
    name: "Ensure non-owner cannot update platform fee",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!; // Not the contract owner
        const newFee = 10; // 10%

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'update-platform-fee',
                [types.uint(newFee)],
                user1.address
            )
        ]);

        // Assert that the update failed with ERR-NOT-AUTHORIZED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${1})`); // ERR-NOT-AUTHORIZED
    },
});

Clarinet.test({
    name: "Ensure contract owner can update minimum ticket price",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const newMinPrice = 2000000; // 2 STX

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'update-min-ticket-price',
                [types.uint(newMinPrice)],
                deployer.address
            )
        ]);

        // Assert that the update was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify the minimum price was updated by attempting to create an event with a price below the new minimum
        const futureDate = chain.blockHeight + 1000;
        const invalidPrice = newMinPrice - 1;

        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(invalidPrice),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Assert that the event creation failed with ERR-INVALID-PRICE
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${5})`); // ERR-INVALID-PRICE

        // Now try with a valid price
        const validPrice = newMinPrice;

        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(validPrice),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Assert that the event creation was successful
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, '(ok true)');
    },
});

Clarinet.test({
    name: "Ensure users cannot validate already used tickets",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Organizer validates the ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'validate-ticket',
                [types.uint(1)], // ticket ID 1
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // Organizer tries to validate the ticket again
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'validate-ticket',
                [types.uint(1)], // ticket ID 1
                deployer.address
            )
        ]);

        // Assert that the validation failed with ERR-TICKET-USED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${10})`); // ERR-TICKET-USED
    },
});

Clarinet.test({
    name: "Ensure users cannot refund already used tickets",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // Organizer validates the ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'validate-ticket',
                [types.uint(1)], // ticket ID 1
                deployer.address
            )
        ]);

        // User tries to refund the used ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user1.address
            )
        ]);

        // Assert that the refund failed with ERR-TICKET-USED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${10})`); // ERR-TICKET-USED
    },
});

Clarinet.test({
    name: "Ensure users cannot refund already refunded tickets",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // User purchases a ticket
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            )
        ]);

        // User requests a refund
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user1.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // User tries to refund the ticket again
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'refund-ticket',
                [types.uint(1)], // ticket ID 1
                user1.address
            )
        ]);

        // Assert that the refund failed with ERR-TICKET-USED
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${10})`); // ERR-TICKET-USED
    },
});

Clarinet.test({
    name: "Ensure purchase fails for non-existent events",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const user1 = accounts.get('wallet_1')!;
        const nonExistentEventId = 999;

        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(nonExistentEventId)],
                user1.address
            )
        ]);

        // Assert that the purchase failed with ERR-EVENT-NOT-FOUND
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result, `(err u${2})`); // ERR-EVENT-NOT-FOUND
    },
});

Clarinet.test({
    name: "Ensure multiple users can purchase tickets for the same event",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const user1 = accounts.get('wallet_1')!;
        const user2 = accounts.get('wallet_2')!;
        const user3 = accounts.get('wallet_3')!;
        const futureDate = chain.blockHeight + 1000;

        // Create an event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        // Multiple users purchase tickets
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user1.address
            ),
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user2.address
            ),
            Tx.contractCall(
                CONTRACT_NAME,
                'purchase-ticket',
                [types.uint(1)], // event ID 1
                user3.address
            )
        ]);

        // Assert that all purchases were successful
        assertEquals(block.receipts.length, 3);
        assertEquals(block.receipts[0].result, '(ok true)');
        assertEquals(block.receipts[1].result, '(ok true)');
        assertEquals(block.receipts[2].result, '(ok true)');

        // Verify the event data was updated correctly
        const event = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const eventData = event.result.expectSome().expectTuple();
        assertEquals(eventData['tickets-sold'].expectUint(), 3);
        assertEquals(eventData['revenue'].expectUint(), TICKET_PRICE * 3);
    },
});

Clarinet.test({
    name: "Ensure an event organizer can create multiple events",
    async fn(chain: Chain, accounts: Map<string, Account>)
    {
        const deployer = accounts.get('deployer')!;
        const futureDate = chain.blockHeight + 1000;

        // Create first event
        let block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8(EVENT_NAME),
                    types.utf8(EVENT_DESCRIPTION),
                    types.utf8(EVENT_VENUE),
                    types.uint(futureDate),
                    types.uint(TOTAL_TICKETS),
                    types.uint(TICKET_PRICE),
                    types.uint(REFUND_WINDOW),
                    types.utf8(EVENT_CATEGORY)
                ],
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // Create second event
        block = chain.mineBlock([
            Tx.contractCall(
                CONTRACT_NAME,
                'create-event',
                [
                    types.utf8("Second Event"),
                    types.utf8("Description for second event"),
                    types.utf8("Second Venue"),
                    types.uint(futureDate + 100),
                    types.uint(TOTAL_TICKETS * 2),
                    types.uint(TICKET_PRICE * 2),
                    types.uint(REFUND_WINDOW),
                    types.utf8("Workshop")
                ],
                deployer.address
            )
        ]);

        assertEquals(block.receipts[0].result, '(ok true)');

        // Verify both events exist and have correct data
        const event1 = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(1)],
            deployer.address
        );

        const event2 = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-event',
            [types.uint(2)],
            deployer.address
        );

        const event1Data = event1.result.expectSome().expectTuple();
        const event2Data = event2.result.expectSome().expectTuple();

        assertEquals(event1Data['name'].expectUtf8(), EVENT_NAME);
        assertEquals(event2Data['name'].expectUtf8(), "Second Event");

        // Check organizer data
        const organizerData = chain.callReadOnlyFn(
            CONTRACT_NAME,
            'get-organizer-revenue',
            [types.principal(deployer.address)],
            deployer.address
        );

        const organizerInfo = organizerData.result.expectSome().expectTuple();
        assertEquals(organizerInfo['events-organized'].expectUint(), 2);
    },
});
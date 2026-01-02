export const GRAPHQL_QUERIES = {
    GET_ACTIVE_SUBSCRIPTION: `
        {
            appInstallation {
                id
                activeSubscriptions {
                    id
                    name
                    status
                    test
                    currentPeriodEnd
                }
            }
        }
    `,
    // Add other GraphQL queries here
};

package com.runlify.graphql;

import com.runlify.metadata.EntityMetadata;
import com.runlify.metadata.EntityNames;
import com.runlify.metadata.MetadataLoader;
import graphql.schema.idl.RuntimeWiring;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.graphql.autoconfigure.GraphQlSourceBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.graphql.execution.RuntimeWiringConfigurer;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Wires the dynamic GraphQL schema + data fetchers into Spring GraphQL.
 *
 * Instead of providing a custom GraphQlSource bean (which bypasses the
 * auto-configured HTTP endpoint), we provide:
 *   1. A GraphQlSourceBuilderCustomizer that feeds the generated SDL
 *   2. A RuntimeWiringConfigurer that registers all data fetchers
 *
 * This lets Spring Boot's auto-config handle the HTTP handler + GraphiQL.
 */
@Configuration
public class GraphqlConfiguration {

    private static final Logger log = LoggerFactory.getLogger(GraphqlConfiguration.class);

    @Bean
    public GraphQlSourceBuilderCustomizer sdlCustomizer(
        MetadataLoader metadataLoader,
        GraphqlSchemaBuilder schemaBuilder
    ) {
        var sdl = schemaBuilder.buildSdl(metadataLoader.getMetadata());
        log.info("Generated GraphQL SDL ({} chars)", sdl.length());
        log.debug("SDL:\n{}", sdl);

        return builder -> builder.schemaResources(
            new ByteArrayResource(sdl.getBytes(StandardCharsets.UTF_8))
        );
    }

    @Bean
    public RuntimeWiringConfigurer runtimeWiringConfigurer(
        MetadataLoader metadataLoader,
        CrudDataFetcherFactory crudFactory,
        SliceDataFetcherFactory sliceFactory,
        DocumentPostingService postingService
    ) {
        var metadata = metadataLoader.getMetadata();
        return wiringBuilder -> {
            for (var entity : metadata.allEntities()) {
                wireEntity(wiringBuilder, entity, crudFactory, sliceFactory, postingService);
            }
        };
    }

    private void wireEntity(
        RuntimeWiring.Builder wiring,
        EntityMetadata entity,
        CrudDataFetcherFactory crudFactory,
        SliceDataFetcherFactory sliceFactory,
        DocumentPostingService postingService
    ) {
        var singular = EntityNames.singularName(entity);
        var plural = EntityNames.pluralName(entity);

        // Query data fetchers
        wiring.type("Query", builder -> builder
            .dataFetcher(singular, crudFactory.findOne(entity))
            .dataFetcher("all" + plural, crudFactory.findAll(entity))
            .dataFetcher("_all" + plural + "Meta", crudFactory.count(entity))
        );

        // Slice queries for periodic info registries
        if (entity.isInfoRegistry() && entity.period() != null) {
            wiring.type("Query", builder -> builder
                .dataFetcher("sliceOfTheLast" + singular, sliceFactory.sliceOfTheLast(entity))
                .dataFetcher("sliceOfTheFirst" + singular, sliceFactory.sliceOfTheFirst(entity))
            );
        }

        // Mutation data fetchers
        if (entity.isDocument() && !entity.registries().isEmpty()) {
            // Document with registries: wrap create/update/remove with posting logic
            wiring.type("Mutation", builder -> builder
                .dataFetcher("create" + singular, env -> {
                    var result = crudFactory.create(entity).get(env);
                    @SuppressWarnings("unchecked")
                    var row = (Map<String, Object>) result;
                    postingService.post(entity, row);
                    return row;
                })
                .dataFetcher("update" + singular, env -> {
                    var result = crudFactory.update(entity).get(env);
                    @SuppressWarnings("unchecked")
                    var row = (Map<String, Object>) result;
                    postingService.rePost(entity, row);
                    return row;
                })
                .dataFetcher("remove" + singular, env -> {
                    var id = env.getArgument("id");
                    postingService.unPost(entity, id);
                    return crudFactory.remove(entity).get(env);
                })
            );
        } else {
            // Plain CRUD
            wiring.type("Mutation", builder -> builder
                .dataFetcher("create" + singular, crudFactory.create(entity))
                .dataFetcher("update" + singular, crudFactory.update(entity))
                .dataFetcher("remove" + singular, crudFactory.remove(entity))
            );
        }
    }
}
